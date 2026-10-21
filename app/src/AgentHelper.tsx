// "Use AI to prepare my response": the AI helper's screens.
//
//   1. About you   name and address for the forms (only if not saved yet)
//   2. Papers      the same paper screens as step by step (PaperSteps.tsx):
//                  which boxes are checked, the renewal form's questions,
//                  then each paper, one at a time
//   3. Running     the live action log, one line per step
//   4. Pauses      the AI waits while the person looks things over, signs,
//                  or takes a photo. These are the person's hands, not the AI's.
//   5. The end     the saved packet, or a plain message if it had to stop
//
// There is no separate "may we use AI?" screen: the person said yes on the
// app's first screen, which says what is sent (Neil, Oct 20: ask once).
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
import { buildPacket, type AboutYou, type PacketInput } from './packet'
import { AboutForm, Done, fetchForm } from './ReplyPacket'
import PaperSteps from './PaperSteps'
import { helpFor } from './paperHelp'
import { CoverPreview, PhotoPreview, RenewalPreview, StatementPreview, letterValue } from './ReplyPreview'
import SignaturePad from './SignaturePad'
import { addPaper, listEvents, listPapers, loadAbout, saveAbout, saveHelperLog, type Paper, type SavedLetter } from './storage'
import { allowedPicks, onePerPaper, usePapers } from './usePapers'
import { factLabel, savedOn } from './words'
import { t } from './language'

type Papers = ReturnType<typeof usePapers>

// While the AI waits for the person, the screen shows one of these. `answer`
// hands the person's choice back to the waiting tool.
type Pause =
  | { kind: 'review'; view: ReviewView; answer: (choice: ReviewAnswer | null) => void }
  | { kind: 'sign'; answer: (png: Uint8Array | null) => void }
  | { kind: 'photo'; paperName: string; answer: (paperId: string | null) => void }

type Stage = 'about' | 'papers' | 'running' | 'ended'

const isReplyPacket = (p: Paper) => p.name.startsWith('Reply packet')

export default function AgentHelper({ letter, onBack, onManual }: {
  letter: SavedLetter
  onBack: () => void
  onManual: () => void
}) {
  const [about, setAbout] = useState<AboutYou | null>(loadAbout)
  const [stage, setStage] = useState<Stage>(about ? 'papers' : 'about')
  const [log, setLog] = useState<LogLine[]>([])
  const [pause, setPause] = useState<Pause | null>(null)
  const [end, setEnd] = useState<RunEnd | null>(null)
  const made = useRef<Paper | null>(null)
  // The papers: the same screens and answers as step by step (usePapers.ts).
  const papers = usePapers(letter)
  // The AI's tools run outside the screens, so they read the newest answers here.
  const latest = useRef(papers)
  latest.current = papers

  function show(next: Stage) {
    setStage(next)
    window.scrollTo(0, 0)
  }

  // Which run is the current one. "Stop and go back" moves it on, so a run
  // the person stopped can't pull them back to its ending screen later.
  const runId = useRef(0)

  async function start() {
    const mine = ++runId.current
    show('running')
    setLog([])
    made.current = null
    const lines: LogLine[] = []
    // A stopped run can't show its screens any more; it just waits, unseen.
    const pauseIfCurrent = (next: Pause | null) => {
      if (mine === runId.current) setPause(next)
    }
    const result = await runAgent(makeWorld(letter, about!, pauseIfCurrent, made, latest), newRunState(), askAI, (line) => {
      lines.push(line)
      if (mine === runId.current) setLog([...lines])
    })
    saveHelperLog(lines.map(logRecord))
    if (mine !== runId.current) return
    setPause(null)
    setEnd(result)
    show('ended')
  }

  // On the review screen: back to the papers right away, without waiting
  // for the AI to answer (the review tool still tells it "cancelled").
  function stopAndGoBack(answer: (choice: ReviewAnswer | null) => void) {
    runId.current += 1
    answer(null)
    setPause(null)
    show('papers')
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
          show('papers')
        }}
      />
    )
  }

  if (stage === 'papers') {
    return (
      <PaperSteps {...papers.stepsProps}>
        <button className="button primary big" onClick={start}>
          {t('Next: put my reply together')}
        </button>
        <button className="link" onClick={onBack}>
          {t('Back to my letter')}
        </button>
      </PaperSteps>
    )
  }

  if (stage === 'ended') {
    if (end?.finished && made.current) return <Done paper={made.current} letterType={letter.letterType} onBack={onBack} />
    return (
      <>
        <h1 className="page-title">{end?.finished ? t("We're done") : t("We couldn't finish")}</h1>
        {end?.message && <p className="lead">{end.message}</p>}
        <ActionLog log={log} />
        <button className="button primary" onClick={start}>
          {t('Try again')}
        </button>
        <button className="button" onClick={onManual}>
          {t('Go step by step instead')}
        </button>
        <button className="link" onClick={onBack}>
          {t('Back to my letter')}
        </button>
      </>
    )
  }

  // Running: a pause screen if the AI is waiting for the person, and the live log.
  return (
    <>
      {pause?.kind === 'review' && (
        <ReviewScreen
          view={pause.view}
          letter={letter}
          about={about!}
          papers={papers}
          answer={pause.answer}
          onStop={() => stopAndGoBack(pause.answer)}
        />
      )}
      {pause?.kind === 'sign' && <SignScreen answer={pause.answer} />}
      {pause?.kind === 'photo' && <PhotoScreen paperName={pause.paperName} answer={pause.answer} />}
      {!pause && (
        <>
          <h1 className="page-title">{t('Putting your reply together…')}</h1>
          <p className="lead" role="status">
            {t('This takes about a minute. Keep this screen open.')}
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
  latest: { current: Papers },
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
    consent: true, // they chose AI help on the app's first screen, which says what is sent
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
    // Saved under the matching paper's name, so the papers list shows it as done.
    async takePhoto(asked) {
      const { photoItems, toSend, answers, renewalForm } = latest.current
      // The app fills in the renewal form from the person's answers, so a
      // photo of the county's paper copy is never needed (Oct 20 run).
      if (renewalForm && /renewal form|mc ?210/i.test(asked)) return null
      const item = closestItem(asked, photoItems ?? toSend)
      // The person already answered for this paper on the paper screens ("I'll
      // put the paper copy in", "I don't have it", "later"), so don't ask again.
      if (answers[item] && answers[item] !== 'photo') return null
      const id = await waitFor<string | null>((answer) => ({ kind: 'photo', paperName: item, answer }))
      if (id) await latest.current.addPhoto(item, id)
      return id
    },
    review: (view) => waitFor<ReviewAnswer | null>((answer) => ({ kind: 'review', view, answer })),
    sign: () => waitFor<Uint8Array | null>((answer) => ({ kind: 'sign', answer })),
    // Neil's fill_renewal_answers tool fills blanks in the renewal form here.
    renewal: latest.current.renewalForm
      ? {
          answers: () => latest.current.renewal,
          fill: (found) => latest.current.fillFromPapers(found),
        }
      : undefined,

    // Only called by build_packet, after its checks passed. The same forms,
    // the same papers list and the same buildPacket as step by step.
    async build(packet, drafts, signature) {
      const { renewalForm } = latest.current
      const [hearingRequest, renewalSignaturePage, renewalFormBytes] = await Promise.all([
        fetchForm('/forms/hearing-request.pdf'),
        fetchForm('/forms/mc210rv-signature-page.pdf'),
        renewalForm ? fetchForm('/forms/mc210rv.pdf') : Promise.resolve(undefined),
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
        toSend: latest.current.included,
        statements: latest.current.statements,
        later: latest.current.later,
        renewal: renewalForm ? latest.current.renewal : undefined,
        attachments,
        signature,
        forms: { hearingRequest, renewalSignaturePage, renewalForm: renewalFormBytes },
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
      <h2>{t("What we've done so far")}</h2>
      <ol className="action-log">
        {log.map((line, i) => (
          <li key={i}>{logWords(line)}</li>
        ))}
      </ol>
      <details className="more">
        <summary>{t('Details')}</summary>
        {log.map((line, i) => (
          <span key={i} className="log-record">
            {logRecord(line)}
          </span>
        ))}
      </details>
    </div>
  )
}

// The review screen: the person's hands. The same preview as step by step,
// and the same ways to change things: the papers (the same paper screens),
// a date or number, a draft letter. Done hands their choices back; the tool
// then reruns the checker.
function ReviewScreen({ view, letter, about, papers, answer, onStop }: {
  view: ReviewView
  letter: SavedLetter
  about: AboutYou
  papers: Papers
  answer: (choice: ReviewAnswer | null) => void
  onStop: () => void
}) {
  const { packet, drafts, explanations } = view
  const { chosen, setChosen } = papers
  const [editingPapers, setEditingPapers] = useState(false)
  // A hearing is a backup, so it starts unticked unless the county made a
  // mistake (then there is a restore letter too). The person can tick it.
  const mistakeFound = drafts.some((d) => d.kind === 'restore_letter')
  const [kept, setKept] = useState<string[]>(
    drafts.filter((d) => d.kind !== 'hearing_request' || mistakeFound).map((d) => d.id),
  )
  const yellow = packet.check?.yellowBoxes ?? []
  // The form boxes stay folded away unless something does not match.
  const [changing, setChanging] = useState(yellow.length > 0)
  const [reasons, setReasons] = useState<Record<string, string>>(Object.fromEntries(drafts.map((d) => [d.id, d.reason])))
  const [formFacts, setFormFacts] = useState(packet.formFacts)

  // A photo the AI picked goes in too, beside the ones from the paper screens,
  // if it is for this letter (allowedPicks): one per paper, and never the
  // Medicare card (onePerPaper).
  useEffect(() => {
    listPapers()
      .then((all) => {
        papers.setPapers(all)
        setChosen((old) => {
          const picks = allowedPicks(packet.paperIds.filter((id) => !old.includes(id)), all, papers.photoItems ?? [], letter.savedAt)
          return onePerPaper([...old, ...picks], all)
        })
      })
      .catch(() => {})
  }, [])

  if (editingPapers) {
    return (
      <PaperSteps {...papers.stepsProps}>
        <button
          className="button primary big"
          onClick={() => {
            setEditingPapers(false)
            window.scrollTo(0, 0)
          }}
        >
          {t('Back to my reply')}
        </button>
      </PaperSteps>
    )
  }

  const photos = papers.papers.filter((p) => chosen.includes(p.id) && !isReplyPacket(p))
  const tooMany = chosen.length > MAX_PAPERS
  // A kept hearing request needs a reason, like in the step-by-step reply.
  const missingReason = drafts.some((d) => d.kind === 'hearing_request' && kept.includes(d.id) && !reasons[d.id]?.trim())

  return (
    <>
      <h1 className="page-title">{t('Look over your reply')}</h1>
      <p className="lead">{t("This is what we'll send to the county. Read it through. You can change anything before you sign.")}</p>
      {packet.check?.pass && (
        <p className="all-good" role="status">
          {t('✓ The dates and numbers match your letter.')}
        </p>
      )}

      <CoverPreview
        letterType={letter.letterType}
        about={about}
        facts={formFacts}
        today={todayOnThisPhone()}
        toSend={papers.included}
        statements={papers.statements}
        later={papers.later}
        hearing={drafts.some((d) => d.kind === 'hearing_request' && kept.includes(d.id))}
        undoLetter={drafts.some((d) => d.kind === 'restore_letter' && kept.includes(d.id))}
      />
      {papers.renewalForm && (
        <RenewalPreview
          answers={papers.renewal}
          fromPapers={papers.fromPapers}
          onChange={() => {
            papers.stepsProps.renewal?.onStep('review')
            setEditingPapers(true)
            window.scrollTo(0, 0)
          }}
        />
      )}
      {papers.statements.length > 0 && <StatementPreview statements={papers.statements} />}
      <PhotoPreview photos={photos} onRemove={(id) => setChosen(chosen.filter((c) => c !== id))} />
      {tooMany && <p className="hint">{t('You can send up to {n} photos. Take some out.', { n: MAX_PAPERS })}</p>}

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

      {changing && (
        <>
          <h2 className="section-title">{t('What goes on your forms')}</h2>
          {yellow.length > 0 ? (
            <p className="error" role="alert">
              {yellow.length === 1 ? t('Fix the yellow box so it matches your letter.') : t('Fix the yellow boxes so they match your letter.')}
            </p>
          ) : (
            <p className="lead">{t('Change what is wrong, then tap Check again.')}</p>
          )}
          {Object.keys(formFacts).map((field) => {
            const box = yellow.find((b) => b.field === field)
            return (
              <label key={field} className={`fact ${box ? 'flagged' : ''}`}>
                <span className="fact-label">{factLabel(field)}</span>
                <input value={formFacts[field]} onChange={(e) => setFormFacts({ ...formFacts, [field]: e.target.value })} />
                {box && (
                  <span className="fact-flag">
                    {t('Your letter says: {value}', { value: letterValue(field, box.expected) })}
                    {explanations[box.yellow_box_id] ? `. ${explanations[box.yellow_box_id]}` : ''}
                  </span>
                )}
              </label>
            )
          })}
        </>
      )}

      <button
        className="button primary big"
        disabled={missingReason || tooMany}
        onClick={() => answer({ paperIds: chosen, keptDraftIds: kept, reasons, formFacts })}
      >
        {changing ? t('Check again') : t('It looks right. Next, sign it')}
      </button>
      {missingReason && <p className="hint">{t('Write why, or untick the hearing.')}</p>}
      <p className="hint">{t('Want to change something?')}</p>
      <div className="button-row">
        <button
          className="button"
          onClick={() => {
            setEditingPapers(true)
            window.scrollTo(0, 0)
          }}
        >
          {t('The papers')}
        </button>
        <button className="button" onClick={() => setChanging(true)}>
          {t('A date or number')}
        </button>
      </div>
      <button className="link" onClick={onStop}>
        {t('Stop and go back')}
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
          {hearing ? t('Also ask for a hearing') : t('Letter asking the county to fix its mistake')}
        </strong>
        <span>
          {hearing
            ? t('Only if you think the county made a mistake. A judge looks at it.')
            : t('The county may have made a mistake. The law: {law}', { law: draft.citation ?? '' })}
        </span>
      </button>
      {on && (
        <label className="field">
          <span>{hearing ? t('Why do you think the county is wrong?') : t('What happened, in your words')}</span>
          <textarea value={reason} onChange={(e) => onReason(e.target.value)} />
          {!reason.trim() && <span className="hint">{t('The AI left this blank. Please write it yourself.')}</span>}
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
      <h1 className="page-title">{t('Sign your reply')}</h1>
      <p className="lead">{t("Sign in the box with your finger. When you sign, you're saying everything in your reply is true. Your signature stays on this phone.")}</p>
      <SignaturePad onChange={setSignature} />
      <button className="button primary big" disabled={!signature} onClick={() => answer(signature)}>
        {t('Sign and finish')}
      </button>
      <button className="button" onClick={() => answer(null)}>
        {t('Not now')}
      </button>
    </>
  )
}

// The AI asked for a paper that has no photo yet. The same help as on the
// paper screens: what it is and where people usually find it.
function PhotoScreen({ paperName, answer }: { paperName: string; answer: (paperId: string | null) => void }) {
  const help = helpFor(paperName)
  return (
    <>
      <h1 className="page-title">{t('Can you take a photo of this?')}</h1>
      <p className="lead">{paperName ? t(paperName) : t('A paper for your reply')}</p>
      {paperName && (
        <div className="card">
          <p>
            <strong>{t('What it is:')} </strong>
            {t(help.what)}
          </p>
          <p>
            <strong>{t('Where to find it:')} </strong>
            {t(help.where)}
          </p>
        </div>
      )}
      <label className="button primary big">
        {t('Take a photo of it')}
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
        {t("I don't have it right now")}
      </button>
    </>
  )
}
