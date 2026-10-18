// "Use AI to prepare my response": the AI helper's screens.
//
//   1. About you   name and address for the forms (only if not saved yet)
//   2. Consent     what is sent to the AI, with private details removed
//   3. Running     the live action log, one line per step
//   4. Pauses      the AI waits while the person looks things over, signs,
//                  or takes a photo. These are the person's hands, not the AI's.
//   5. The end     the saved packet, or a plain message if it had to stop
//
// The loop itself is agentLoop.ts and the tools are agentTools.ts, both from
// Neil's agent/TOOLS.md. This file only gives the tools the phone's storage
// and these screens to work with (the "world" below).
import { useEffect, useRef, useState } from 'react'
import { askAI } from './agentApi'
import { runAgent, type LogLine, type RunEnd } from './agentLoop'
import { newRunState, MAX_PAPERS, type AgentWorld, type Draft, type ReviewAnswer, type ReviewView } from './agentTools'
import { closestItem, letterId, logRecord, logWords, restoreLetterBody } from './agentWords'
import { check } from './checker'
import { todayOnThisPhone } from './deadlines'
import { readText } from './ocr'
import { buildPacket, coverNote, type AboutYou, type PacketInput } from './packet'
import { AboutForm, Done, fetchForm, RENEWAL_PHOTOS } from './ReplyPacket'
import PaperChecklist, { missingPhotos } from './PaperChecklist'
import { whatToSend } from './letterJob'
import SignaturePad from './SignaturePad'
import { addPaper, listEvents, listPapers, loadAbout, saveAbout, saveHelperLog, type Paper, type SavedLetter } from './storage'
import { FACT_LABELS, savedOn } from './words'

// While the AI waits for the person, the screen shows one of these. `answer`
// hands the person's choice back to the waiting tool.
type Pause =
  | { kind: 'review'; view: ReviewView; answer: (choice: ReviewAnswer | null) => void }
  | { kind: 'sign'; answer: (png: Uint8Array | null) => void }
  | { kind: 'photo'; paperName: string; answer: (paperId: string | null) => void }

type Stage = 'about' | 'consent' | 'running' | 'ended'

const isReplyPacket = (p: Paper) => p.name.startsWith('Reply packet')

export default function AgentHelper({ letter, onBack, onManual }: {
  letter: SavedLetter
  onBack: () => void
  onManual: () => void
}) {
  const [about, setAbout] = useState<AboutYou | null>(loadAbout)
  const [stage, setStage] = useState<Stage>(about ? 'consent' : 'about')
  const [log, setLog] = useState<LogLine[]>([])
  const [pause, setPause] = useState<Pause | null>(null)
  const [end, setEnd] = useState<RunEnd | null>(null)
  const made = useRef<Paper | null>(null)

  async function start() {
    setStage('running')
    setLog([])
    made.current = null
    const lines: LogLine[] = []
    const result = await runAgent(makeWorld(letter, about!, setPause, made), newRunState(), askAI, (line) => {
      lines.push(line)
      setLog([...lines])
    })
    saveHelperLog(lines.map(logRecord))
    setPause(null)
    setEnd(result)
    setStage('ended')
    window.scrollTo(0, 0)
  }

  if (stage === 'about') {
    return (
      <AboutForm
        about={about}
        letterText={letter.text}
        onBack={onBack}
        onSave={(next) => {
          saveAbout(next)
          setAbout(next)
          setStage('consent')
          window.scrollTo(0, 0)
        }}
      />
    )
  }

  if (stage === 'consent') {
    return (
      <>
        <h1 className="page-title">We'll put your reply together for you</h1>
        <p className="lead">
          We look at your letter and the papers you've saved, and ask you for photos of anything missing. Then you
          read it over and sign. We never send anything to the county. You do that yourself.
        </p>
        <div className="card">
          <h2>What the AI sees</h2>
          <p className="small">We take out your name, address and case number first.</p>
          <ol className="checklist">
            <li>What your letter says</li>
            <li>What you wrote down about papers you sent</li>
            <li>The words on the papers you saved</li>
          </ol>
          <p className="small">Your photos and your signature never leave this phone.</p>
        </div>
        <button className="button primary big" onClick={start}>
          Yes, help me
        </button>
        <button className="button" onClick={onManual}>
          No, I'll go step by step
        </button>
        <button className="link" onClick={onBack}>
          Back to my letter
        </button>
      </>
    )
  }

  if (stage === 'ended') {
    if (end?.finished && made.current) return <Done paper={made.current} letterType={letter.letterType} onBack={onBack} />
    return (
      <>
        <h1 className="page-title">{end?.finished ? "We're done" : "We couldn't finish"}</h1>
        {end?.message && <p className="lead">{end.message}</p>}
        <ActionLog log={log} />
        <button className="button primary" onClick={start}>
          Try again
        </button>
        <button className="button" onClick={onManual}>
          Go step by step instead
        </button>
        <button className="link" onClick={onBack}>
          Back to my letter
        </button>
      </>
    )
  }

  // Running: a pause screen if the AI is waiting for the person, and the live log.
  return (
    <>
      {pause?.kind === 'review' && <ReviewScreen view={pause.view} letter={letter} answer={pause.answer} />}
      {pause?.kind === 'sign' && <SignScreen answer={pause.answer} />}
      {pause?.kind === 'photo' && <PhotoScreen paperName={pause.paperName} answer={pause.answer} />}
      {!pause && (
        <>
          <h1 className="page-title">Putting your reply together…</h1>
          <p className="lead" role="status">
            This takes about a minute. Keep this screen open.
          </p>
        </>
      )}
      <ActionLog log={log} />
    </>
  )
}

// The tools' view of the phone: storage, the forms, and the pause screens.
function makeWorld(
  letter: SavedLetter,
  about: AboutYou,
  setPause: (pause: Pause | null) => void,
  made: { current: Paper | null },
): AgentWorld {
  // Reading a photo takes a few seconds, so each paper is read only once.
  const texts = new Map<string, string>()
  // Waits until the person answers on a pause screen.
  function waitFor<T>(show: (answer: (value: T) => void) => Pause): Promise<T> {
    return new Promise((resolve) => {
      setPause(show((value) => {
        setPause(null)
        window.scrollTo(0, 0)
        resolve(value)
      }))
      window.scrollTo(0, 0)
    })
  }
  const papers = async () => (await listPapers()).filter((p) => !isReplyPacket(p))

  return {
    letter: { id: letterId(letter), letterType: letter.letterType, facts: letter.facts, text: letter.text ?? '' },
    consent: true, // they tapped "Yes, start"
    // Blanked everywhere, even with no label next to them (agentLoop.ts).
    privateNames: [about.name, about.street].filter((word) => word.trim().length > 0),
    async listPapers() {
      return (await papers()).map((p) => ({ id: p.id, name: p.name, addedAt: p.addedAt }))
    },
    async paperText(id) {
      if (texts.has(id)) return texts.get(id)!
      const paper = (await papers()).find((p) => p.id === id)
      if (!paper) return null
      // Photos are read on the phone, like the letter. A PDF is not read, so
      // the AI only gets its name. If reading fails, the AI is told so and the
      // run goes on, instead of the whole helper stopping.
      let text = `(This paper is a ${paper.type || 'file'} called "${paper.name}". Its words were not read.)`
      if (paper.type.startsWith('image/')) {
        try {
          text = (await readText(paper.file, () => {})).text
        } catch (error) {
          console.error(error)
          text = `(The photo called "${paper.name}" could not be read. Judge it by its name.)`
        }
      }
      texts.set(id, text)
      return text
    },
    listEvents,
    // Saved under the matching checklist line, so the checklist shows it as done.
    takePhoto: (asked) =>
      waitFor<string | null>((answer) => ({
        kind: 'photo',
        paperName: closestItem(asked, whatToSend(letter.letterType, letter.facts.ask ?? null)),
        answer,
      })),
    review: (view) => waitFor<ReviewAnswer | null>((answer) => ({ kind: 'review', view, answer })),
    sign: () => waitFor<Uint8Array | null>((answer) => ({ kind: 'sign', answer })),

    // Only called by build_packet, after its checks passed. The same forms
    // and the same buildPacket as "Manually prepare my response".
    async build(packet, drafts, signature) {
      const [hearingRequest, renewalSignaturePage] = await Promise.all([
        fetchForm('/forms/hearing-request.pdf'),
        fetchForm('/forms/mc210rv-signature-page.pdf'),
      ])
      const chosen = (await papers()).filter((p) => packet.paperIds.includes(p.id))
      const attachments = await Promise.all(
        chosen.map(async (p) => ({ name: p.name, type: p.type, bytes: new Uint8Array(await p.file.arrayBuffer()) })),
      )
      const hearing = drafts.find((d) => d.kind === 'hearing_request')
      const restore = drafts.find((d) => d.kind === 'restore_letter')
      const input: PacketInput = {
        letterType: letter.letterType,
        about,
        facts: packet.formFacts,
        today: todayOnThisPhone(),
        hearing: hearing ? { reason: hearing.reason } : null,
        undoLetter: restore ? restoreLetterBody(restore) : null,
        toSend: whatToSend(letter.letterType, letter.facts.ask ?? null),
        attachments,
        signature,
        forms: { hearingRequest, renewalSignaturePage },
      }
      // buildPacket checks the checker and the signature once more itself.
      const bytes = await buildPacket(input, check(packet.formFacts, confirmed(letter)), true)
      const name = `Reply packet, ${savedOn(new Date().toISOString())}.pdf`
      made.current = await addPaper(new Blob([bytes as BlobPart], { type: 'application/pdf' }), name)
      return made.current.addedAt
    },
  }
}

const confirmed = (letter: SavedLetter) =>
  Object.fromEntries(Object.entries(letter.facts).filter(([field]) => field !== 'ask'))

// The live action log (TOOLS.md, Section 6): plain words, with the exact
// records folded away underneath for anyone who wants them.
function ActionLog({ log }: { log: LogLine[] }) {
  if (log.length === 0) return null
  return (
    <div className="card">
      <h2>What we've done so far</h2>
      <ol className="action-log">
        {log.map((line, i) => (
          <li key={i}>{logWords(line)}</li>
        ))}
      </ol>
      <details className="more">
        <summary>Details</summary>
        {log.map((line, i) => (
          <span key={i} className="log-record">
            {logRecord(line)}
          </span>
        ))}
      </details>
    </div>
  )
}

// The review screen: the person's hands. They can change the papers, untick
// a draft, rewrite a reason and fix yellow boxes. Done hands their choices
// back; the tool then reruns the checker.
function ReviewScreen({ view, letter, answer }: {
  view: ReviewView
  letter: SavedLetter
  answer: (choice: ReviewAnswer | null) => void
}) {
  const { packet, drafts, explanations } = view
  const [papers, setPapers] = useState<Paper[]>([])
  const [paperIds, setPaperIds] = useState<string[]>(packet.paperIds)
  // A hearing is a backup, so it starts unticked unless the county made a
  // mistake (then there is a restore letter too). The person can tick it.
  const mistakeFound = drafts.some((d) => d.kind === 'restore_letter')
  const [kept, setKept] = useState<string[]>(
    drafts.filter((d) => d.kind !== 'hearing_request' || mistakeFound).map((d) => d.id),
  )
  // The form boxes stay folded away unless something does not match.
  const [changing, setChanging] = useState((packet.check?.yellowBoxes ?? []).length > 0)
  const [reasons, setReasons] = useState<Record<string, string>>(Object.fromEntries(drafts.map((d) => [d.id, d.reason])))
  const [formFacts, setFormFacts] = useState(packet.formFacts)
  const [atLimit, setAtLimit] = useState(false)
  // The papers the county asked for, each with its own photo button.
  const photoItems = letter.letterType === 'MC210_RV' ? RENEWAL_PHOTOS : whatToSend(letter.letterType, letter.facts.ask ?? null)

  useEffect(() => {
    listPapers().then((all) => setPapers(all.filter((p) => !isReplyPacket(p)))).catch(() => setPapers([]))
  }, [])

  // A kept hearing request needs a reason, like in the manual flow.
  const missingReason = drafts.some((d) => d.kind === 'hearing_request' && kept.includes(d.id) && !reasons[d.id]?.trim())
  const yellow = packet.check?.yellowBoxes ?? []

  return (
    <>
      <h1 className="page-title">Look over your reply</h1>
      <p className="lead">This is what we'll send to the county. Read it through, and change anything you want.</p>

      <div className="card preview">
        <p className="preview-label">The cover letter says</p>
        <p className="preview-note">{coverNote(letter.letterType, packet.formFacts.notice_date)}</p>
      </div>

      <h2 className="section-title">Your papers</h2>
      <p className="hint">Tap a button to take a photo of a paper. We'll add it to your reply.</p>
      <PaperChecklist
        items={photoItems}
        papers={papers}
        chosen={paperIds}
        onChange={(ids) => {
          setAtLimit(ids.length > MAX_PAPERS)
          setPaperIds(ids.slice(0, MAX_PAPERS))
        }}
        onPapersChanged={(all) => setPapers(all.filter((p) => !isReplyPacket(p)))}
      />
      {atLimit && <p className="hint">You can send up to {MAX_PAPERS} papers. Untick one to add another.</p>}
      {missingPhotos(photoItems, papers, paperIds) > 0 && (
        <p className="hint">Some papers have no photo yet. That's okay. You can put paper copies in the envelope yourself.</p>
      )}

      {/* The restore letter first, then the hearing (a backup). */}
      {[...drafts]
        .sort((a, b) => (a.kind === 'restore_letter' ? -1 : 1) - (b.kind === 'restore_letter' ? -1 : 1))
        .map((draft) => (
          <DraftChoice
            key={draft.id}
            draft={draft}
            on={kept.includes(draft.id)}
            reason={reasons[draft.id] ?? ''}
            onToggle={() => setKept(kept.includes(draft.id) ? kept.filter((k) => k !== draft.id) : [...kept, draft.id])}
            onReason={(text) => setReasons({ ...reasons, [draft.id]: text })}
          />
        ))}

      {yellow.length === 0 && !changing ? (
        <>
          <p className="all-good">✓ Your reply matches your letter.</p>
          <button className="link" onClick={() => setChanging(true)}>
            Something wrong? Change it
          </button>
        </>
      ) : (
        <>
          <h2 className="section-title">What goes on your forms</h2>
          {yellow.length > 0 && (
            <p className="error" role="alert">
              Fix the yellow {yellow.length === 1 ? 'box' : 'boxes'} so they match your letter.
            </p>
          )}
          {Object.keys(formFacts).map((field) => {
            const box = yellow.find((b) => b.field === field)
            return (
              <label key={field} className={`fact ${box ? 'flagged' : ''}`}>
                <span className="fact-label">{FACT_LABELS[field] ?? field}</span>
                <input value={formFacts[field]} onChange={(e) => setFormFacts({ ...formFacts, [field]: e.target.value })} />
                {box && (
                  <span className="fact-flag">
                    Your letter says: {box.expected}
                    {explanations[box.yellow_box_id] ? `. ${explanations[box.yellow_box_id]}` : ''}
                  </span>
                )}
              </label>
            )
          })}
        </>
      )}

      <button
        className="button primary"
        disabled={missingReason}
        onClick={() => answer({ paperIds, keptDraftIds: kept, reasons, formFacts })}
      >
        Done
      </button>
      {missingReason && <p className="hint">Write why, or untick the hearing.</p>}
      <button className="link" onClick={() => answer(null)}>
        Stop and go back
      </button>
    </>
  )
}

function DraftChoice({ draft, on, reason, onToggle, onReason }: {
  draft: Draft
  on: boolean
  reason: string
  onToggle: () => void
  onReason: (text: string) => void
}) {
  const hearing = draft.kind === 'hearing_request'
  return (
    <>
      <button className={`choice ${on ? 'on' : ''}`} onClick={onToggle}>
        <strong>
          {on ? '✓ ' : ''}
          {hearing ? 'Also ask for a hearing' : 'Letter asking the county to fix its mistake'}
        </strong>
        <span>
          {hearing
            ? 'Only if you think the county made a mistake. A judge looks at it.'
            : `The county may have made a mistake. The law: ${draft.citation ?? ''}`}
        </span>
      </button>
      {on && (
        <label className="field">
          <span>{hearing ? 'Why do you think the county is wrong?' : 'What happened, in your words'}</span>
          <textarea value={reason} onChange={(e) => onReason(e.target.value)} />
          {!reason.trim() && <span className="hint">The AI left this blank. Please write it yourself.</span>}
        </label>
      )}
    </>
  )
}

// The signature pad. The signature goes straight to the code, never to the AI.
function SignScreen({ answer }: { answer: (png: Uint8Array | null) => void }) {
  const [signature, setSignature] = useState<Uint8Array | null>(null)
  return (
    <>
      <h1 className="page-title">Sign your reply</h1>
      <p className="lead">Sign in the box with your finger. When you sign, you're saying everything in your reply is true. Your signature stays on this phone.</p>
      <SignaturePad onChange={setSignature} />
      <button className="button primary" disabled={!signature} onClick={() => answer(signature)}>
        Sign
      </button>
      <button className="button" onClick={() => answer(null)}>
        Not now
      </button>
    </>
  )
}

// The AI asked for a paper that is not saved yet.
function PhotoScreen({ paperName, answer }: { paperName: string; answer: (paperId: string | null) => void }) {
  return (
    <>
      <h1 className="page-title">Can you take a photo of this?</h1>
      <p className="lead">Please take a photo of: {paperName || 'a paper'}.</p>
      <label className="button primary">
        Take the photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            const paper = await addPaper(file, paperName || `Photo, ${savedOn(new Date().toISOString())}`)
            answer(paper.id)
          }}
        />
      </label>
      <button className="button" onClick={() => answer(null)}>
        I don't have it
      </button>
    </>
  )
}
