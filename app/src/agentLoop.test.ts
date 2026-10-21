// Tests for the loop and the tools (Claude's code). Claude is replaced by a
// script, and the phone by a fake world, so these run with no internet.
//
// The tests that build_packet refuses an unsigned or unchecked packet are
// Neil's to write (TODO.md, week 5); they are not here on purpose.
import { describe, expect, it } from 'vitest'
import { newRunState, type AgentWorld, type ReviewAnswer } from './agentTools'
import { runAgent, type Block, type LogLine, type Message } from './agentLoop'
import type { TimelineEvent } from './contradictions'

// A fake phone: one MC 239 A letter, two papers, and events that make Neil's
// rule 1 fire (papers in before the stop date, stopped anyway).
function fakeWorld(changes: Partial<AgentWorld> = {}) {
  const built: { draftIds: string[]; paperIds: string[] }[] = []
  const events: TimelineEvent[] = [
    { date: '2026-10-03', type: 'papers_sent', description: 'Mailed my papers', subject: 'You', proof: 'receipt.jpg' },
    { date: '2026-10-20', type: 'coverage_denied', description: 'Got the stop letter', subject: 'County', proof: '' },
  ]
  const world: AgentWorld = {
    letter: {
      id: 'letter-1',
      letterType: 'MC_239A',
      facts: { notice_date: '2026-10-15', effective_date: '2026-10-31', case_number: '1B7P329', worker_name: 'Ana Ruiz' },
      text: 'Notice for: Maria Garcia\nCase number: 1B7P329\nYour Medi-Cal stops October 31, 2026.',
    },
    consent: true,
    privateNames: [],
    listPapers: async () => [
      { id: 'paper-a', name: 'Maria Garcia bank statement', addedAt: '2026-10-10T10:00:00Z' },
      { id: 'paper-b', name: 'Mail receipt', addedAt: '2026-10-03T10:00:00Z' },
    ],
    paperText: async (id) => (id === 'paper-a' ? 'Maria Garcia\nSSN 123-45-6789\nAccount 4417123456789 balance $310' : id === 'paper-b' ? 'USPS receipt' : null),
    listEvents: async () => events,
    takePhoto: async () => null,
    // The fake user approves everything as proposed.
    review: async ({ packet, drafts }): Promise<ReviewAnswer> => ({
      paperIds: packet.paperIds,
      keptDraftIds: packet.draftIds,
      reasons: Object.fromEntries(drafts.map((d) => [d.id, d.reason])),
      formFacts: packet.formFacts,
    }),
    sign: async () => new Uint8Array([1, 2, 3]),
    build: async (packet, drafts) => {
      built.push({ draftIds: drafts.map((d) => d.id), paperIds: packet.paperIds })
      return '2026-10-16T12:00:00Z'
    },
    ...changes,
  }
  return { world, built }
}

// A pretend Claude that asks for one tool per turn, in order, then says it is done.
function scripted(calls: [string, Record<string, unknown>][]) {
  const seen: Message[][] = []
  let turn = 0
  const ask = async (messages: Message[]): Promise<Block[]> => {
    seen.push(structuredClone(messages))
    const next = calls[turn++]
    if (!next) return [{ type: 'text', text: 'All done.' }]
    return [{ type: 'tool_use', id: `call-${turn}`, name: next[0], input: next[1] }]
  }
  // What the loop sent back for each tool, as Claude would read it.
  const results = () =>
    seen.flatMap((messages) => messages.slice(-1)).flatMap((m) =>
      Array.isArray(m.content) ? m.content.flatMap((b) => (b.type === 'tool_result' ? [JSON.parse(b.content)] : [])) : []
    )
  return { ask, results }
}

const L = { letter_id: 'letter-1' }
const P = { packet_id: 'packet-letter-1' }

async function run(calls: [string, Record<string, unknown>][], world = fakeWorld().world) {
  const claude = scripted(calls)
  const log: LogLine[] = []
  const state = newRunState()
  const end = await runAgent(world, state, claude.ask, (line) => log.push(line))
  return { end, log, results: claude.results(), state }
}

describe('the first message to the AI', () => {
  // What the loop's first message said, for a world.
  async function firstMessage(world: AgentWorld) {
    const seen: Message[][] = []
    const ask = async (messages: Message[]): Promise<Block[]> => {
      seen.push(structuredClone(messages))
      return [{ type: 'text', text: 'All done.' }]
    }
    await runAgent(world, newRunState(), ask, () => {})
    return JSON.parse(seen[0][0].content as string)
  }

  it('names the letter only, when there is no renewal form in the reply', async () => {
    expect(await firstMessage(fakeWorld().world)).toEqual({ letter_id: 'letter-1', letter_type: 'MC_239A' })
  })

  // From the Oct 20 run: a stop letter that asks for the renewal form. The AI
  // only saw "MC_239A" and never filled in the bank's name from the statement.
  it('says which renewal facts are still blank, when the reply has the renewal form', async () => {
    const answers = { bank: 'yes', bank_name: '', bank_balance: '', social_security: 'yes', social_security_amount: '1240.00' }
    const first = await firstMessage(fakeWorld({ renewal: { answers: () => answers, fill: () => {} } }).world)
    expect(first.letter_type).toBe('MC_239A')
    expect(first.renewal_form.filled_in_by_app).toBe(true)
    expect(first.renewal_form.blank_facts).toEqual(expect.arrayContaining(['bank_name', 'bank_balance']))
    expect(first.renewal_form.blank_facts).not.toContain('social_security_amount')
  })
})

describe('the AI helper loop', () => {
  it('runs a whole MC 239 A reply from letter to saved packet', async () => {
    const { world, built } = fakeWorld()
    const { end, log } = await run(
      [
        ['get_letter', L],
        ['check_county_mistake', L],
        ['draft_hearing_request', { ...L, reason_text: 'I mailed my papers on October 3, 2026.' }],
        ['draft_restore_letter', { ...L, mistake_id: 'mistake-rule-1', reason_text: 'My papers were in before the stop date.' }],
        ['propose_packet', { ...L, paper_ids: ['paper-b'], draft_ids: ['draft-hearing', 'draft-restore'] }],
        ['run_checker', P],
        ['open_review_screen', { ...P, explanations: [] }],
        ['ask_user_to_sign', P],
        ['build_packet', P],
      ],
      world
    )
    expect(end).toEqual({ finished: true, message: 'All done.' })
    expect(built).toEqual([{ draftIds: ['draft-hearing', 'draft-restore'], paperIds: ['paper-b'] }])
    expect(log.map((l) => l.outcome)).toEqual(Array(9).fill('ok'))
  })

  it('never shows Claude the name, case number, SSN or account number', async () => {
    const { results } = await run([
      ['get_letter', L],
      ['get_paper_text', { paper_id: 'paper-a' }],
      ['list_papers', {}],
    ])
    const sent = JSON.stringify(results)
    for (const secret of ['Maria', 'Garcia', '1B7P329', '123-45-6789', '4417123456789']) expect(sent).not.toContain(secret)
    expect(results[0].pii_redacted_facts.notice_date).toBe('2026-10-15') // dates are kept
  })

  it('refuses a tool that is not in TOOLS.md', async () => {
    const { results, log } = await run([['send_fax', { packet_id: 'x' }]])
    expect(results[0]).toEqual({ ok: false, reason: 'no tool named send_fax in TOOLS.md' })
    expect(log[0].outcome).toBe('refuse')
  })

  it('stops after more than 3 ordinary refusals in a row', async () => {
    const { end } = await run(Array(4).fill(['get_paper_text', { paper_id: 'nope' }]))
    expect(end).toMatchObject({ finished: false, rule: 'Section 5: more than 3 soft refusals in a row' })
  })

  it('stops after 25 tool calls', async () => {
    const { end, log } = await run(Array(26).fill(['list_papers', {}]))
    expect(end).toMatchObject({ finished: false, rule: 'Section 5: more than 25 tool calls' })
    expect(log.filter((l) => l.tool === 'list_papers')).toHaveLength(25)
  })

  it('in phone-only mode, the get_ tools refuse', async () => {
    const { results } = await run([['get_letter', L]], fakeWorld({ consent: false }).world)
    expect(results[0]).toEqual({ ok: false, reason: 'phone-only mode' })
  })

  it('a made-up date is refused twice, then the reason is left blank for the user', async () => {
    const bad = { ...L, reason_text: 'I mailed them on November 2, 2026.' }
    const { results, end } = await run([
      ['draft_hearing_request', bad],
      ['draft_hearing_request', bad],
      ['draft_hearing_request', bad],
      ['draft_hearing_request', bad],
    ])
    expect(results.map((r) => r.ok)).toEqual([false, false, true, true])
    expect(results[2]).toEqual({ ok: true, draft_id: 'draft-hearing', reason_left_blank: true })
    expect(end.finished).toBe(true) // date rejections do not count toward "3 in a row"
  })

  it('logs IDs only, never the text Claude sent', async () => {
    const { log } = await run([['draft_hearing_request', { ...L, reason_text: 'My private story' }]])
    expect(log[0].inputs).toBe('letter_id="letter-1" reason_text=(text)')
  })

  it('a draft the user removed cannot be added back by Claude', async () => {
    const { world } = fakeWorld({
      review: async ({ packet }) => ({ paperIds: packet.paperIds, keptDraftIds: [], reasons: {}, formFacts: packet.formFacts }),
    })
    const { results } = await run(
      [
        ['draft_hearing_request', { ...L, reason_text: 'I disagree.' }],
        ['propose_packet', { ...L, paper_ids: [], draft_ids: ['draft-hearing'] }],
        ['open_review_screen', { ...P, explanations: [] }],
        ['propose_packet', { ...L, paper_ids: [], draft_ids: ['draft-hearing'] }],
      ],
      world
    )
    expect(results[2]).toMatchObject({ ok: true, drafts_kept: [] })
    expect(results[3]).toEqual({ ok: false, reason: 'the user removed this draft: draft-hearing' })
  })

  it('a fixed yellow box passes the check on Done; a planted wrong date fails it', async () => {
    let answerDate = '10/20/2026' // wrong: the letter says October 15
    const { world } = fakeWorld({
      review: async ({ packet }) => ({
        paperIds: [],
        keptDraftIds: [],
        reasons: {},
        formFacts: { ...packet.formFacts, notice_date: answerDate },
      }),
    })
    const first = await run([['propose_packet', { ...L, paper_ids: [], draft_ids: [] }], ['open_review_screen', { ...P, explanations: [] }]], world)
    expect(first.results[1]).toMatchObject({ ok: true, check: 'fail' })
    answerDate = '10/15/2026'
    const second = await run([['propose_packet', { ...L, paper_ids: [], draft_ids: [] }], ['open_review_screen', { ...P, explanations: [] }]], world)
    expect(second.results[1]).toMatchObject({ ok: true, check: 'pass' })
  })

  it('a lost connection is a hard stop', async () => {
    const { world } = fakeWorld()
    const end = await runAgent(world, newRunState(), async () => { throw new Error('offline') }, () => {})
    expect(end).toMatchObject({ finished: false, rule: 'Section 5: internet lost' })
  })
})
