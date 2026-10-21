// "What happened": the user's timeline, checked with Neil's county-mistake
// rules (contradictions.ts). When a rule fires, the app can write the letter
// asking the county to undo the stop.
import { useEffect, useMemo, useState } from 'react'
import { findMistakes, type EventKind, type Finding, type TimelineEvent } from './contradictions'
import {
  addEvent,
  addPaper,
  listEvents,
  listPapers,
  removeEvent,
  saveDrafts,
  loadDrafts,
  updateEvent,
  type Paper,
  type SavedEvent,
  type SavedLetter,
} from './storage'
import { askForDrafts, type Drafts } from './readerA'
import { todayOnThisPhone } from './deadlines'
import { shortPrint } from './fingerprint'
import { inWords, savedOn } from './words'
import { t } from './language'

// Each kind of event in plain words, and who does it. Most common first.
const KIND_WORDS: { kind: EventKind; label: string; who: 'You' | 'County' }[] = [
  { kind: 'papers_sent', label: 'I sent my papers', who: 'You' },
  { kind: 'papers_received', label: 'The county got my papers', who: 'County' },
  { kind: 'coverage_denied', label: 'My Medi-Cal was stopped', who: 'County' },
  { kind: 'coverage_restored', label: 'My Medi-Cal came back', who: 'County' },
  { kind: 'receipt_received', label: 'I got a receipt', who: 'You' },
  { kind: 'receipt_sent', label: 'The county sent me a receipt', who: 'County' },
  { kind: 'letter_arrived', label: 'A letter arrived', who: 'You' },
  { kind: 'county_sent_letter', label: 'The county sent me a letter', who: 'County' },
]
const wordsFor = (kind: EventKind) => KIND_WORDS.find((k) => k.kind === kind)!

export default function Timeline({ letter, onBack }: { letter: SavedLetter | null; onBack: () => void }) {
  const [events, setEvents] = useState<SavedEvent[] | null>(null)
  const [papers, setPapers] = useState<Paper[]>([])
  const [adding, setAdding] = useState(false)
  // The event the user is adding proof to, if any.
  const [proofFor, setProofFor] = useState<SavedEvent | null>(null)
  const [storageFailed, setStorageFailed] = useState(false)

  async function refresh() {
    try {
      setEvents(await listEvents())
      setPapers(await listPapers())
    } catch (error) {
      console.error(error)
      setStorageFailed(true)
      setEvents([])
    }
  }
  useEffect(() => {
    refresh()
  }, [])

  // Neil's rules only apply to a notice that stops coverage.
  const stopsCoverage = letter?.letterType === 'MC_239A'
  const findings = useMemo(
    () => (events && stopsCoverage ? findMistakes(events, letter.facts.notice_date, letter.facts.effective_date) : []),
    [events, letter, stopsCoverage]
  )

  async function remove(event: SavedEvent) {
    if (!window.confirm(t('Remove "{what}" from {date}?', { what: t(wordsFor(event.type).label), date: inWords(event.date, false) }))) return
    await removeEvent(event.id)
    refresh()
  }

  if (proofFor) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setProofFor(null)
        }}
      >
        <h1 className="page-title">{t('Add proof')}</h1>
        <p className="lead">
          {t('For "{what}" on {date}.', { what: t(wordsFor(proofFor.type).label), date: inWords(proofFor.date, false) })}
        </p>
        <ProofPicker
          papers={papers}
          picked={null}
          noneChoice={false}
          onPapersChanged={refresh}
          onPick={async (paper) => {
            if (paper) await updateEvent({ ...proofFor, proof: proofText(paper) })
            setProofFor(null)
            refresh()
          }}
        />
        <button type="submit" className="button">
          {t('Cancel')}
        </button>
      </form>
    )
  }

  if (adding) {
    return (
      <AddEvent
        papers={papers}
        onPapersChanged={refresh}
        onCancel={() => setAdding(false)}
        onSave={async (event) => {
          await addEvent(event)
          setAdding(false)
          refresh()
        }}
      />
    )
  }

  return (
    <>
      <h1 className="page-title">{t("What you've sent")}</h1>
      <p className="lead">
        {t("Write down when you sent papers and what the county did after. If the county made a mistake, we'll tell you.")}
      </p>
      {storageFailed && <p className="error">{t('This phone is not letting the app save. Private browsing can cause this.')}</p>}

      {findings.map((finding) => (
        <FindingCard key={finding.rule} finding={finding} />
      ))}
      {findings.length > 0 && letter && <WriteLetters letter={letter} findings={findings} events={events ?? []} />}

      <button className="button primary" onClick={() => setAdding(true)}>
        {t('+ Write something down')}
      </button>

      {events && events.length === 0 && (
        <p className="hint">{t("Nothing here yet. If you've already mailed or dropped off papers, write down the day you did.")}</p>
      )}
      {events && events.length > 0 && (
        <ol className="events">
          {events.map((event) => {
            const words = wordsFor(event.type)
            const needsProof = event.type === 'papers_sent' && !event.proof
            return (
              <li key={event.id} className={`event ${words.who === 'County' ? 'county' : ''}`}>
                <p className="event-date">{inWords(event.date)}</p>
                <p className="event-what">{t(words.label)}</p>
                {event.description && event.description !== words.label && <p className="event-note">{event.description}</p>}
                <div className="event-bottom">
                  {event.proof ? (
                    <span className="proof">{t('Proof: {proof}', { proof: event.proof })}</span>
                  ) : (
                    <>
                      {needsProof && <span className="proof missing">{t('No proof yet')}</span>}
                      <button className="link" onClick={() => setProofFor(event)}>
                        {t('Add proof')}
                      </button>
                    </>
                  )}
                  <button className="link danger" onClick={() => remove(event)}>
                    {t('Remove')}
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {events && events.length > 0 && !stopsCoverage && (
        <p className="hint">{t('The mistake check works with a notice that your Medi-Cal is being stopped.')}</p>
      )}
      <button className="button" onClick={onBack}>
        {t('Back to my letter')}
      </button>
    </>
  )
}

// One of Neil's rules fired. His reason, in his words, with the law.
function FindingCard({ finding }: { finding: Finding }) {
  return (
    <div className="finding" role="alert">
      <h2>
        <WarningIcon /> {t('The county may have made a mistake')}
      </h2>
      <p>{t(finding.reason)}</p>
      <p className="small">{t('Your papers count from {date}.', { date: inWords(finding.date, false) })}</p>
      {finding.needs_proof && (
        <p>
          <strong>{t('Do you have proof you sent them?')}</strong> {t('A receipt, a mail slip, or a photo works. Tap "Add proof" on the event below.')}
        </p>
      )}
      <p className="law">{t('Law: {law}', { law: finding.citation.replace(/^Law:\s*/, '') })}</p>
    </div>
  )
}

// Writes the letter to the county and the hearing reason (Neil's draft prompt).
function WriteLetters({ letter, findings, events }: { letter: SavedLetter; findings: Finding[]; events: TimelineEvent[] }) {
  const [state, setState] = useState<'idle' | 'writing' | 'failed'>('idle')
  // Drafts already written are kept, so they are not paid for twice.
  const [drafts, setDrafts] = useState<Drafts | null>(loadDrafts)

  if (letter.mode !== 'ai') {
    return (
      <p className="hint">
        {t('We can write a letter asking the county to fix this, but that needs AI help. You chose to read your letter on your phone only.')}
      </p>
    )
  }

  async function write() {
    setState('writing')
    const answer = await askForDrafts({ letter_type: letter.letterType, ...letter.facts }, findings, events)
    setDrafts(answer)
    saveDrafts(answer)
    setState(answer ? 'idle' : 'failed')
  }

  if (!drafts) {
    return (
      <>
        <button className="button primary" onClick={write} disabled={state === 'writing'}>
          {state === 'writing' ? t('Writing your letter…') : t('Write my letter to the county')}
        </button>
        {state === 'failed' && <p className="error">{t('We could not write it right now. Please try again later.')}</p>}
      </>
    )
  }

  return (
    <>
      <DraftCard title={t('Letter asking the county to undo the stop')} text={drafts.rescission_letter} />
      <DraftCard title={t('Why I disagree (for the hearing form)')} text={drafts.hearing_reason} />
      <p className="hint">
        {t('These go into your reply when you tap the big button on your letter screen. Read both before you send anything.')}
      </p>
    </>
  )
}

function DraftCard({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // Copying needs https; the text is still there to select by hand.
    }
  }
  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="draft-text" lang="en">{text}</p>
      <button className="button" onClick={copy}>
        {copied ? t('Copied') : t('Copy')}
      </button>
    </div>
  )
}

// The add form: what happened, when, a note, and proof.
function AddEvent({ papers, onPapersChanged, onCancel, onSave }: {
  papers: Paper[]
  onPapersChanged: () => void
  onCancel: () => void
  onSave: (event: TimelineEvent) => void
}) {
  const [kind, setKind] = useState<EventKind | null>(null)
  const [date, setDate] = useState(todayOnThisPhone())
  const [note, setNote] = useState('')
  const [proofId, setProofId] = useState<string | null>(null)

  if (!kind) {
    return (
      <>
        <h1 className="page-title">{t('What happened?')}</h1>
        {KIND_WORDS.map((k) => (
          <button key={k.kind} className="choice" onClick={() => setKind(k.kind)}>
            <strong>{t(k.label)}</strong>
          </button>
        ))}
        <button className="button" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </>
    )
  }

  const words = wordsFor(kind)

  function save(event: React.FormEvent) {
    event.preventDefault()
    const proof = papers.find((p) => p.id === proofId)
    onSave({
      date,
      type: kind!,
      description: note.trim() || words.label,
      subject: words.who,
      proof: proof ? proofText(proof) : '',
    })
  }

  return (
    <form onSubmit={save}>
      <h1 className="page-title">{t(words.label)}</h1>
      <label className="field">
        <span>{t('When?')}</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label className="field">
        <span>{t('Anything to add? (you can skip this)')}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'papers_sent' ? t('For example: mailed my bank statements') : ''}
        />
      </label>

      <div className="field">
        <span>{t('Proof (you can skip this)')}</span>
        <ProofPicker papers={papers} picked={proofId} onPapersChanged={onPapersChanged} onPick={(p) => setProofId(p?.id ?? null)} />
      </div>

      <button type="submit" className="button primary">
        {t('Save')}
      </button>
      <button type="button" className="button" onClick={onCancel}>
        {t('Cancel')}
      </button>
    </form>
  )
}

// How proof is written on an event: the file's name and its fingerprint.
const proofText = (paper: Paper) => `${paper.name} (${shortPrint(paper.sha256)})`

// Pick a saved paper as proof, or take a new photo (saved to My papers too).
function ProofPicker({ papers, picked, noneChoice = true, onPapersChanged, onPick }: {
  papers: Paper[]
  picked: string | null
  noneChoice?: boolean
  onPapersChanged: () => void
  onPick: (paper: Paper | null) => void
}) {
  async function addPhoto(input: React.ChangeEvent<HTMLInputElement>) {
    const file = input.target.files?.[0]
    input.target.value = ''
    if (!file) return
    const name = file.name && !/^image\.\w+$/i.test(file.name) ? file.name : `Photo, ${savedOn(new Date().toISOString())}`
    const paper = await addPaper(file, name)
    onPapersChanged()
    onPick(paper)
  }
  // Newest first, and each paper once: a retaken photo has the same name.
  const shown = [...papers]
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .filter((paper, i, all) => paper.id === picked || all.findIndex((p) => p.name === paper.name) === i)
  return (
    <>
      <p className="small">{t('A receipt, a mail slip, or a photo of what you sent.')}</p>
      {noneChoice && (
        <button type="button" className={`choice ${picked === null ? 'on' : ''}`} onClick={() => onPick(null)}>
          <strong>{t('No proof')}</strong>
        </button>
      )}
      {shown.map((paper) => (
        <button
          type="button"
          key={paper.id}
          className={`choice ${picked === paper.id ? 'on' : ''}`}
          onClick={() => onPick(paper)}
        >
          <strong>{t(paper.name)}</strong>
          <span>{t('Saved {date}', { date: savedOn(paper.addedAt) })}</span>
        </button>
      ))}
      <label className="button">
        {t('Take a photo of my proof')}
        <input type="file" accept="image/*" capture="environment" onChange={addPhoto} hidden />
      </label>
    </>
  )
}

const WarningIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path d="M12 3l10 18H2z" strokeLinejoin="round" />
    <path d="M12 10v5M12 18v.5" strokeLinecap="round" />
  </svg>
)
