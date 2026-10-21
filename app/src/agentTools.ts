// The AI helper's tools: exactly the ones in Neil's agent/TOOLS.md, and no others.
//
// Claude never runs anything itself. It asks the loop (agentLoop.ts) to run a
// tool by name; the loop looks the name up in TOOLS below and calls it. Every
// tool checks its own preconditions here, in code, before doing anything. The
// "What it does" text sent to Claude is copied word for word from TOOLS.md.
//
// Two kinds of refusal (TOOLS.md, Section 2):
//   soft refuse  the tool returns { ok: false, reason } and Claude can try again
//   hard stop    the tool throws HardStop and the whole run ends
import { check } from './checker'
import { findMistakes, type Finding, type TimelineEvent } from './contradictions'
import { inventedDates } from './grounding'
import { paperFactsFrom, type PaperFacts } from './packet'
import { valueInText } from './proofRead'
import { blankFacts, FROM_PAPERS, PARENT } from './renewalForm'

export type ToolResult = { ok: boolean; reason?: string; [key: string]: unknown }

// Thrown to end the run. The message is what the user sees.
export class HardStop extends Error {
  rule: string
  constructor(rule: string, message: string) {
    super(message)
    this.rule = rule
  }
}

export type Draft = {
  id: string
  kind: 'hearing_request' | 'restore_letter'
  reason: string
  citation: string | null // restore letter only: the law, from Neil's county-mistake rules
}

export type YellowBox = { yellow_box_id: string; form: string; field: string; found: string; expected: string }

// The one packet this run is working on.
export type Packet = {
  id: string
  status: 'proposed' | 'approved'
  version: number // approved_version: goes up on every Done on the review screen
  paperIds: string[]
  draftIds: string[] // the drafts still in the packet
  formFacts: PaperFacts // what gets written on the forms; the user can fix these
  check: { pass: boolean; version: number; yellowBoxes: YellowBox[] } | null
  signature: { png: Uint8Array; version: number } | null
  builtVersions: number[]
}

// What the review screen shows, and what the user hands back when they tap Done.
export type ReviewView = {
  packet: Packet
  drafts: Draft[]
  explanations: Record<string, string> // yellow_box_id -> Claude's plain words
}
export type ReviewAnswer = {
  paperIds: string[]
  keptDraftIds: string[]
  reasons: Record<string, string> // draft id -> the reason as the user left it
  formFacts: PaperFacts
}

// Everything outside the loop: the phone's storage and the screens. The app
// passes the real ones in; the tests pass in fakes.
export type AgentWorld = {
  letter: { id: string; letterType: string; facts: Record<string, string | null>; text: string }
  consent: boolean // the user said yes to sending redacted text
  privateNames: string[] // the person's name from About you; blanked everywhere
  listPapers(): Promise<{ id: string; name: string; addedAt: string }[]>
  paperText(id: string): Promise<string | null> // null: no such paper
  listEvents(): Promise<TimelineEvent[]>
  takePhoto(paperName: string): Promise<string | null> // the new paper's id, or null if cancelled
  review(view: ReviewView): Promise<ReviewAnswer | null> // null: cancelled
  sign(): Promise<Uint8Array | null> // straight from the signature pad; null: declined
  build(packet: Packet, drafts: Draft[], signature: Uint8Array): Promise<string> // when it was saved
  // Only when the reply includes the renewal form: its answers so far, and a
  // way to fill in the blanks (the review screen then shows them).
  renewal?: {
    answers(): Record<string, string>
    fill(found: { question: string; value: string; paperId: string; paperName: string }[]): void
  }
}

// What the tools remember during one run.
export type RunState = {
  drafts: Map<string, Draft>
  packet: Packet | null
  earlier: Packet | null // an approved packet from an earlier run, if any
  mistakes: Map<string, Finding> // mistake_id -> what Neil's rules found, this run
  removedDrafts: Set<string> // drafts the user unticked; Claude may not add them back
  dateRejections: { reasons: number; explanations: number }
}

export const newRunState = (earlier: Packet | null = null): RunState => ({
  drafts: new Map(),
  packet: null,
  earlier,
  mistakes: new Map(),
  removedDrafts: new Set(),
  dateRejections: { reasons: 0, explanations: 0 },
})

// Results that are normal answers, not refusals (TOOLS.md: "Cancelling is a
// normal result"). The loop does not count these toward the 3-in-a-row limit.
export const NORMAL_REASONS = ['cancelled', 'declined']

// Section 5: two rewrites after a date rejection, then the third gives up.
export const MAX_DATE_REWRITES = 2
export const MAX_PAPERS = 10

const refuse = (reason: string): ToolResult => ({ ok: false, reason })
const dateRefuse = (dates: string[]): ToolResult => ({
  ok: false,
  reason: `mentions a date that is not in the confirmed facts or the timeline: ${dates.join(', ')}`,
  date_rejected: true,
})

// The dates a reason or explanation may mention: the confirmed facts and the timeline.
async function allowedDates(world: AgentWorld): Promise<Record<string, unknown>> {
  const events = await world.listEvents()
  return { ...world.letter.facts, ...Object.fromEntries(events.map((e, i) => [`event_${i}`, e.date])) }
}

// The confirmed facts the checker compares the forms with. "ask" is the
// county's request, not a fact that goes on a form.
const confirmedFacts = (world: AgentWorld) =>
  Object.fromEntries(Object.entries(world.letter.facts).filter(([field]) => field !== 'ask'))

function runChecker(world: AgentWorld, packet: Packet) {
  const yellowBoxes = check(packet.formFacts, confirmedFacts(world)).map((m) => ({
    yellow_box_id: `box-${m.field}`,
    form: m.form ?? 'cover sheet',
    field: m.field,
    found: packet.formFacts[m.field] ?? '',
    expected: m.fact,
  }))
  packet.check = { pass: yellowBoxes.length === 0, version: packet.version, yellowBoxes }
}

const isLetter = (world: AgentWorld, input: Input) => input.letter_id === world.letter.id
const isPacket = (state: RunState, input: Input) => state.packet !== null && input.packet_id === state.packet.id

type Input = Record<string, unknown>
type Tool = {
  whatItDoes: string // from TOOLS.md, word for word
  inputs: Record<string, 'text' | 'list'> // what Claude must send
  run(input: Input, world: AgentWorld, state: RunState): Promise<ToolResult>
}

// Shared by both draft tools: the date check, with the third rejection saving
// the draft with an empty reason so the run goes on (Section 5).
async function saveDraft(world: AgentWorld, state: RunState, draft: Draft): Promise<ToolResult> {
  const invented = inventedDates(draft.reason, await allowedDates(world))
  if (invented.length > 0) {
    state.dateRejections.reasons += 1
    if (state.dateRejections.reasons <= MAX_DATE_REWRITES) return dateRefuse(invented)
    state.drafts.set(draft.id, { ...draft, reason: '' })
    return { ok: true, draft_id: draft.id, reason_left_blank: true }
  }
  state.drafts.set(draft.id, draft)
  return { ok: true, draft_id: draft.id }
}

export { blankFacts }

export const TOOLS: Record<string, Tool> = {
  get_letter: {
    whatItDoes:
      'returns the PII-redacted text, type and PII-redacted confirmed facts of the letter that started this response.',
    inputs: { letter_id: 'text' },
    async run(input, world) {
      if (!world.consent) return refuse('phone-only mode')
      if (!isLetter(world, input)) return refuse('no such letter')
      // The case number is taken out here, and the loop redacts everything again.
      return {
        ok: true,
        letter_id: world.letter.id,
        letter_type: world.letter.letterType,
        pii_redacted_text: world.letter.text,
        pii_redacted_facts: { ...world.letter.facts, case_number: null },
      }
    },
  },

  get_timeline: {
    whatItDoes: 'returns the events the user recorded for this letter. An empty list is a normal result.',
    inputs: { letter_id: 'text' },
    async run(input, world) {
      if (!world.consent) return refuse('phone-only mode')
      if (!isLetter(world, input)) return refuse('no such letter')
      const events = await world.listEvents()
      return {
        ok: true,
        events: events.map((e) => ({ date: e.date, event_type: e.type, pii_redacted_note: e.description })),
      }
    },
  },

  list_papers: {
    whatItDoes:
      'lists the papers in My papers with their IDs, PII-redacted names and dates added. No text. An empty list is a normal result.',
    inputs: {},
    async run(_input, world) {
      if (!world.consent) return refuse('phone-only mode')
      const papers = await world.listPapers()
      return {
        ok: true,
        papers: papers.map((p) => ({ paper_id: p.id, pii_redacted_name: p.name, date_added: p.addedAt.slice(0, 10) })),
      }
    },
  },

  get_paper_text: {
    whatItDoes: 'returns the PII-redacted text of one paper so Claude can tell what kind of paper it is.',
    inputs: { paper_id: 'text' },
    async run(input, world) {
      if (!world.consent) return refuse('phone-only mode')
      const text = typeof input.paper_id === 'string' ? await world.paperText(input.paper_id) : null
      if (text === null) return refuse('no such paper')
      return { ok: true, paper_id: input.paper_id, pii_redacted_text: text }
    },
  },

  request_photo: {
    whatItDoes: 'opens the camera so the user can photograph a missing paper. Cancelling is a normal result.',
    inputs: { paper_name: 'text' },
    async run(input, world) {
      const id = await world.takePhoto(String(input.paper_name ?? ''))
      return id === null ? refuse('cancelled') : { ok: true, paper_id: id }
    },
  },

  fill_renewal_answers: {
    whatItDoes:
      "for renewal forms only, writes facts read on the person's papers into the renewal form (MC 210 RV): the monthly Social Security amount, the Medicare Part B premium, the pension amount, the bank's name and balance, the Medicare number, and the life insurance cash value. Each answer says which paper it came from. It only fills answers the person left blank.",
    inputs: { letter_id: 'text', answers: 'list' },
    async run(input, world) {
      if (!isLetter(world, input)) return refuse('no such letter')
      if (!world.renewal) return refuse('only for renewal forms')
      const given = Array.isArray(input.answers) ? (input.answers as Input[]) : []
      const current = world.renewal.answers()
      const papers = await world.listPapers()
      const accepted: { question: string; value: string; paperId: string; paperName: string }[] = []
      const refused: { question: string; reason: string }[] = []
      for (const answer of given) {
        const question = String(answer.question ?? '')
        const value = String(answer.value ?? '').trim()
        const paper = papers.find((p) => p.id === String(answer.paper_id ?? ''))
        const no = (reason: string) => refused.push({ question, reason })
        if (!FROM_PAPERS.includes(question)) no('not a fact printed on a paper')
        else if (!paper) no('no such paper')
        else if (current[question] || accepted.some((a) => a.question === question)) no('the person already answered this')
        else if (!valueInText(question, value, (await world.paperText(paper.id)) ?? '')) no('that value is not printed on that paper')
        else accepted.push({ question, value, paperId: paper.id, paperName: paper.name })
      }
      if (accepted.length > 0) world.renewal.fill(accepted)
      const after: Record<string, string> = { ...current }
      for (const a of accepted) {
        after[a.question] = a.value
        after[PARENT[a.question]] ||= 'yes'
      }
      return { ok: true, accepted: accepted.map((a) => a.question), refused, still_blank: blankFacts(after) }
    },
  },

  check_county_mistake: {
    whatItDoes:
      'compares timeline events with the letter dates using the county-mistake rules loaded by the code. No events, or no mistake, is a normal result.',
    inputs: { letter_id: 'text' },
    async run(input, world, state) {
      if (!isLetter(world, input)) return refuse('no such letter')
      const { notice_date, effective_date } = world.letter.facts
      const findings = findMistakes(await world.listEvents(), notice_date ?? null, effective_date ?? null)
      if (findings.length === 0) return { ok: true, mistake_found: false }
      for (const f of findings) state.mistakes.set(`mistake-rule-${f.rule}`, f)
      const first = findings[0]
      return {
        ok: true,
        mistake_found: true,
        mistake_id: `mistake-rule-${first.rule}`,
        mistake_type: `rule_${first.rule}`,
        plain_words: first.reason,
      }
    },
  },

  draft_hearing_request: {
    whatItDoes:
      'for MC 239 A letters only, creates a draft hearing request. Claude supplies the reason for disagreeing; the code fills in case number, dates and county from the confirmed facts. If this run already has a hearing request draft for the letter, the new draft replaces it.',
    inputs: { letter_id: 'text', reason_text: 'text' },
    async run(input, world, state) {
      if (!isLetter(world, input)) return refuse('no such letter')
      if (world.letter.letterType !== 'MC_239A') return refuse('only for MC 239 A letters')
      const reason = String(input.reason_text ?? '')
      return saveDraft(world, state, { id: 'draft-hearing', kind: 'hearing_request', reason, citation: null })
    },
  },

  draft_restore_letter: {
    whatItDoes:
      "creates a draft restore letter for a mistake found by check_county_mistake. Claude supplies the plain-words reason; the code fills in case number, dates, county and the law citations stored in the county-mistake rules. If this run already has a restore letter draft for the letter, the new draft replaces it.",
    inputs: { letter_id: 'text', mistake_id: 'text', reason_text: 'text' },
    async run(input, world, state) {
      if (!isLetter(world, input)) return refuse('no such letter')
      if (world.letter.letterType !== 'MC_239A') return refuse('only for MC 239 A letters')
      const mistake = state.mistakes.get(String(input.mistake_id))
      if (!mistake) return refuse('that mistake_id was not returned by check_county_mistake for this letter')
      const reason = String(input.reason_text ?? '')
      return saveDraft(world, state, { id: 'draft-restore', kind: 'restore_letter', reason, citation: mistake.citation })
    },
  },

  propose_packet: {
    whatItDoes:
      "saves Claude's suggested papers and drafts as a proposal. Nothing is approved yet. If the letter already has an approved packet from an earlier run, this starts a new proposal; Claude's new paper_ids and draft_ids replace the old ones in the proposal, approved_version is bumped, and the old check result and signature are cleared. The user still approves everything on the review screen.",
    inputs: { letter_id: 'text', paper_ids: 'list', draft_ids: 'list' },
    async run(input, world, state) {
      if (!isLetter(world, input)) return refuse('no such letter')
      const paperIds = Array.isArray(input.paper_ids) ? input.paper_ids.map(String) : []
      const draftIds = Array.isArray(input.draft_ids) ? input.draft_ids.map(String) : []
      if (paperIds.length > MAX_PAPERS) return refuse(`at most ${MAX_PAPERS} papers`)
      const onPhone = new Set((await world.listPapers()).map((p) => p.id))
      const missing = paperIds.filter((id) => !onPhone.has(id))
      if (missing.length > 0) return refuse(`no such paper: ${missing.join(', ')}`)
      const unknown = draftIds.filter((id) => !state.drafts.has(id))
      if (unknown.length > 0) return refuse(`no such draft: ${unknown.join(', ')}`)
      // TOOLS.md, Never: Claude never adds a draft back after the user removed it.
      const removed = draftIds.filter((id) => state.removedDrafts.has(id))
      if (removed.length > 0) return refuse(`the user removed this draft: ${removed.join(', ')}`)

      // One packet per run. A second proposal (or one after an earlier run)
      // gets a new version, so any old check result or signature no longer counts.
      const before = state.packet ?? state.earlier
      state.packet = {
        id: before?.id ?? `packet-${world.letter.id}`,
        status: 'proposed',
        version: before ? before.version + 1 : 0,
        paperIds,
        draftIds,
        formFacts: paperFactsFrom(world.letter.facts),
        check: null,
        signature: null,
        builtVersions: before?.builtVersions ?? [],
      }
      return { ok: true, packet_id: state.packet.id }
    },
  },

  run_checker: {
    whatItDoes:
      "compares the facts on the drafted forms with the letter's confirmed facts and reports mismatches as yellow boxes. Only drafts still in the packet are checked. The code stores the result with the current version. A pass with no yellow boxes is a normal result.",
    inputs: { packet_id: 'text' },
    async run(input, world, state) {
      if (!isPacket(state, input)) return refuse('no such packet')
      const packet = state.packet!
      runChecker(world, packet)
      const { pass, version, yellowBoxes } = packet.check!
      return pass ? { ok: true, pass, version } : { ok: true, pass, version, yellow_boxes: yellowBoxes }
    },
  },

  open_review_screen: {
    whatItDoes:
      'shows the user the proposed papers, the drafts and any yellow boxes. They can add or remove papers, untick the hearing request or the restore letter to remove it from the packet (same checkboxes as the manual flow), edit reasons (including writing a reason that was left blank) and fix yellow boxes. The screen does not allow more than 10 papers; the user is told at the limit, and this is not a tool refusal. On Done, the code bumps approved_version, clears the stored check result and signature, reruns the checker and stores the new result. Cancelling is a normal result.',
    inputs: { packet_id: 'text', explanations: 'list' },
    async run(input, world, state) {
      if (!isPacket(state, input)) return refuse('no such packet')
      const packet = state.packet!
      const given = Array.isArray(input.explanations) ? (input.explanations as Input[]) : []
      const realBoxes = new Set((packet.check?.yellowBoxes ?? []).map((b) => b.yellow_box_id))
      const explanations: Record<string, string> = {}
      const allowed = await allowedDates(world)
      for (const e of given) {
        const id = String(e.yellow_box_id)
        const words = String(e.plain_words ?? '')
        if (!realBoxes.has(id)) return refuse(`no yellow box ${id} in the last check`)
        const invented = inventedDates(words, allowed)
        if (invented.length > 0) {
          state.dateRejections.explanations += 1
          if (state.dateRejections.explanations <= MAX_DATE_REWRITES) return dateRefuse(invented)
          continue // the third time, the screen opens without this explanation
        }
        explanations[id] = words
      }

      const drafts = packet.draftIds.map((id) => state.drafts.get(id)!).filter(Boolean)
      const answer = await world.review({ packet, drafts, explanations })
      if (answer === null) return refuse('cancelled')

      // The user's choices become the approved packet. Only the user changes it.
      const before = JSON.stringify([packet.paperIds, packet.draftIds, packet.formFacts, drafts.map((d) => d.reason)])
      for (const id of packet.draftIds) if (!answer.keptDraftIds.includes(id)) state.removedDrafts.add(id)
      for (const [id, reason] of Object.entries(answer.reasons)) {
        const draft = state.drafts.get(id)
        if (draft) state.drafts.set(id, { ...draft, reason })
      }
      packet.paperIds = answer.paperIds.slice(0, MAX_PAPERS)
      packet.draftIds = packet.draftIds.filter((id) => answer.keptDraftIds.includes(id))
      packet.formFacts = { ...answer.formFacts }
      const after = JSON.stringify([
        packet.paperIds, packet.draftIds, packet.formFacts, packet.draftIds.map((id) => state.drafts.get(id)!.reason),
      ])
      packet.status = 'approved'
      packet.version += 1
      packet.signature = null
      runChecker(world, packet)
      return {
        ok: true,
        approved_version: packet.version,
        changed: before !== after,
        check: packet.check!.pass ? 'pass' : 'fail',
        drafts_kept: packet.draftIds,
      }
    },
  },

  ask_user_to_sign: {
    whatItDoes:
      'asks the user to sign on the signature pad. The pad hands the signature straight to the code, stamped with the current approved version. Declining is a normal result.',
    inputs: { packet_id: 'text' },
    async run(input, world, state) {
      if (!isPacket(state, input) || state.packet!.status !== 'approved') return refuse('no approved packet with this packet_id')
      const packet = state.packet!
      if (!packet.check?.pass || packet.check.version !== packet.version) return refuse('the check has not passed for this version')
      if (packet.signature?.version === packet.version) return refuse('already signed for this version')
      const png = await world.sign()
      if (png === null) return refuse('declined')
      packet.signature = { png, version: packet.version }
      return { ok: true, signed_version: packet.version }
    },
  },

  // The locked tool (TOOLS.md, Section 3). Every failed precondition is a hard stop.
  build_packet: {
    whatItDoes:
      "assembles the final response packet and saves it to My papers, once. The packet contains the approved papers plus the same forms the manual flow makes for that letter type: MC 239 A: the cover sheet, the signed hearing request draft if the user kept it, and the signed restore letter draft if one was approved and kept. When the letter asks for the renewal form, also the renewal form filled in from the person's answers, signed on page 17; MC 355: the cover sheet; MC 210 RV (renewal): the cover sheet and the renewal form filled in from the person's answers, signed on page 17; All letters: a signed statement for the papers the person said they do not have, if any.",
    inputs: { packet_id: 'text' },
    async run(input, world, state) {
      const stop = (why: string): never => {
        throw new HardStop(`build_packet: ${why}`, 'Your reply was not made. Please look it over again.')
      }
      const packet = state.packet
      if (!packet || input.packet_id !== packet.id || packet.status !== 'approved') return stop('no approved packet with this packet_id')
      if (!packet.check || !packet.check.pass) return stop('the check has not passed')
      if (packet.check.version !== packet.version) return stop('the check was for an older version')
      if (!packet.signature) return stop('not signed')
      if (packet.signature.version !== packet.version) return stop('the signature was for an older version')
      if (packet.builtVersions.includes(packet.version)) return stop('already built for this version')
      // Papers and drafts come only from what the code stored at review and
      // signing. Claude sent nothing but the packet_id.
      const drafts = packet.draftIds.map((id) => state.drafts.get(id)!)
      const savedAt = await world.build(packet, drafts, packet.signature.png)
      packet.builtVersions.push(packet.version)
      return { ok: true, saved_at: savedAt }
    },
  },
}
