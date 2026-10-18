// "Do it myself": from a checked letter to a signed reply, one thing per screen.
//   First time only   About you: name and address for the forms (kept on this phone)
//   Step 1 of 4       Your papers: what the county asked for, and the papers to send
//   Step 2 of 4       Check: Neil's checker compares the forms to the letter
//   Step 3 of 4       Sign: only once the check passes
//   Step 4 of 4       Done: saved to My papers, ready to print or share
//
// A hearing request goes in only when the person asks for one. It is a backup
// for when they think the county made a mistake; sending the papers is what
// brings Medi-Cal back. The letter asking the county to undo the stop goes in
// when Neil's county-mistake rules found a mistake and it was written on the
// "What happened" screen.
//
// Each step is one plain function underneath (fill, check, sign, build), so
// the AI helper (AgentHelper.tsx) runs the same steps, under Neil's rules in
// agent/TOOLS.md.
import { useEffect, useState } from 'react'
import { check, type Mismatch } from './checker'
import { aboutFromLetter } from './aboutFromLetter'
import { buildPacket, coverNote, paperFactsFrom, type AboutYou, type Attachment, type PacketInput, type PaperFacts } from './packet'
import { addEvent, addPaper, listPapers, loadAbout, loadDrafts, saveAbout, type Paper, type SavedLetter } from './storage'
import { todayOnThisPhone } from './deadlines'
import { shortPrint } from './fingerprint'
import { FACT_LABELS, inWords, savedOn } from './words'
import SignaturePad from './SignaturePad'
import PaperSteps, { type PaperAnswer } from './PaperSteps'
import { helpFor } from './paperHelp'
import { printOrSend } from './printOrSend'
import { whatToSend } from './letterJob'

type Step = 'about' | 'papers' | 'check' | 'sign' | 'done'

// For a renewal, the form itself goes in the envelope on paper. These are the
// proof papers that go with it.
export const RENEWAL_PHOTOS = ['Proof of income, like a Social Security letter', 'Your newest bank statement']

export default function ReplyPacket({ letter, withHearing, onBack }: {
  letter: SavedLetter
  withHearing: boolean // the person tapped "Ask for a hearing"
  onBack: () => void
}) {
  const [step, setStep] = useState<Step>(loadAbout() ? 'papers' : 'about')
  const [about, setAbout] = useState<AboutYou | null>(loadAbout)
  const drafts = loadDrafts()
  const isStop = letter.letterType === 'MC_239A'
  // What the county asked for. A request for papers lists them as checked
  // boxes on page 2, so the person picks them first.
  const [pickedBoxes, setPickedBoxes] = useState<string[] | null>(null)
  const toSend =
    letter.letterType === 'MC355' ? (pickedBoxes ?? []) : whatToSend(letter.letterType, letter.facts.ask ?? null)
  // The papers to go through one at a time. For a renewal, the form itself
  // goes in the envelope on paper; these are the proof that goes with it.
  const photoItems = letter.letterType === 'MC210_RV' ? RENEWAL_PHOTOS : letter.letterType === 'MC355' ? pickedBoxes : toSend
  const [answers, setAnswers] = useState<Record<string, PaperAnswer>>({})
  const [renewalPart, setRenewalPart] = useState<number | 'ask' | 'done'>('ask')
  // "I don't have one" answers become plain sentences on the cover letter.
  const statements = (photoItems ?? []).filter((item) => answers[item] === 'none').map((item) => helpFor(item).noneLine!)
  const later = (photoItems ?? []).filter((item) => answers[item] === 'later')
  const [hearing, setHearing] = useState(isStop && withHearing)
  const [reason, setReason] = useState(drafts?.hearing_reason ?? '')
  const [undoLetter, setUndoLetter] = useState(isStop && !!drafts)
  const [papers, setPapers] = useState<Paper[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  // The facts as written on the forms. The person can change them on the
  // check screen, which is exactly what the checker is for.
  const [paperFacts, setPaperFacts] = useState<PaperFacts>(() => paperFactsFrom(letter.facts))
  const [mismatches, setMismatches] = useState<Mismatch[] | null>(null)
  const [changing, setChanging] = useState(false)
  const [signature, setSignature] = useState<Uint8Array | null>(null)
  const [made, setMade] = useState<Paper | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    listPapers().then(setPapers).catch(() => setPapers([]))
  }, [])

  function go(next: Step) {
    setProblem(null)
    setStep(next)
    window.scrollTo(0, 0)
  }

  // Neil's checker: the forms against the facts the person confirmed.
  function runCheck(facts = paperFacts) {
    const confirmed = Object.fromEntries(Object.entries(letter.facts).filter(([field]) => field !== 'ask'))
    const found = check(facts, confirmed)
    setMismatches(found)
    setChanging(found.length > 0)
    window.scrollTo(0, 0)
  }

  async function makePacket() {
    setWorking(true)
    setProblem(null)
    try {
      const [hearingRequest, renewalSignaturePage] = await Promise.all([
        fetchForm('/forms/hearing-request.pdf'),
        fetchForm('/forms/mc210rv-signature-page.pdf'),
      ])
      const attachments: Attachment[] = await Promise.all(
        papers
          .filter((p) => chosen.includes(p.id))
          .map(async (p) => ({ name: p.name, type: p.type, bytes: new Uint8Array(await p.file.arrayBuffer()) }))
      )
      const input: PacketInput = {
        letterType: letter.letterType,
        about: about!,
        facts: paperFacts,
        today: todayOnThisPhone(),
        hearing: isStop && hearing ? { reason } : null,
        undoLetter: isStop && undoLetter && drafts ? drafts.rescission_letter : null,
        toSend,
        statements,
        attachments,
        signature,
        forms: { hearingRequest, renewalSignaturePage },
      }
      const bytes = await buildPacket(input, mismatches ?? [], true)
      const name = `Reply packet, ${savedOn(new Date().toISOString())}.pdf`
      const paper = await addPaper(new Blob([bytes as BlobPart], { type: 'application/pdf' }), name)
      setMade(paper)
      go('done')
    } catch (error) {
      console.error(error)
      setProblem(error instanceof Error ? error.message : 'We could not make your reply. Please try again.')
    }
    setWorking(false)
  }

  if (step === 'about') {
    return (
      <AboutForm
        about={about}
        letterText={letter.text}
        onBack={onBack}
        onSave={(next) => {
          saveAbout(next)
          setAbout(next)
          go('papers')
        }}
      />
    )
  }

  if (step === 'papers') {
    return (
      <PaperSteps
        letterType={letter.letterType}
        items={photoItems}
        onItems={setPickedBoxes}
        answers={answers}
        onAnswer={(item, answer) =>
          setAnswers((old) => {
            const next = { ...old }
            if (answer) next[item] = answer
            else delete next[item]
            return next
          })
        }
        papers={papers}
        chosen={chosen}
        onChosen={setChosen}
        onPapersChanged={setPapers}
        renewalPart={renewalPart}
        onRenewalPart={(part) => {
          setRenewalPart(part)
          window.scrollTo(0, 0)
        }}
      >
        {isStop && drafts && (
          <button className={`choice ${undoLetter ? 'on' : ''}`} onClick={() => setUndoLetter(!undoLetter)}>
            <strong>{undoLetter ? '✓ ' : ''}Add a letter asking the county to fix their mistake</strong>
            <span>We wrote it from what you told us you sent.</span>
          </button>
        )}

        {isStop && (
          <>
            <button className={`choice ${hearing ? 'on' : ''}`} onClick={() => setHearing(!hearing)}>
              <strong>{hearing ? '✓ ' : ''}Also ask for a hearing</strong>
              <span>Only if you think the county got it wrong. A judge will look at it.</span>
            </button>
            {hearing && (
              <label className="field">
                <span>Why do you think the county got it wrong?</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: I mailed my papers on time." />
              </label>
            )}
          </>
        )}

        <button
          className="button primary"
          onClick={() => {
            runCheck()
            go('check')
          }}
          disabled={hearing && !reason.trim()}
        >
          Next
        </button>
        {hearing && !reason.trim() && <p className="hint">Tell us why, or untick the hearing.</p>}
        <button className="link" onClick={onBack}>
          Back to my letter
        </button>
        <button className="link" onClick={() => go('about')}>
          Change my name or address
        </button>
      </PaperSteps>
    )
  }

  if (step === 'check') {
    const passed = mismatches !== null && mismatches.length === 0
    return (
      <>
        <span className="step">Step 2 of 4</span>
        <h1 className="page-title">Look over your reply</h1>

        {passed && !changing && (
          <>
            <p className="lead">This is what we'll send to the county. Read it through. You can change anything before you sign.</p>
            <p className="all-good" role="status">
              ✓ The dates and numbers match your letter.
            </p>

            <div className="card preview">
              <p className="preview-label">Page 1: the cover letter</p>
              <p>To: {about!.county} County, Medi-Cal</p>
              <p>
                From: {about!.name}, {about!.street}, {about!.city}
              </p>
              {Object.entries(paperFacts)
                .filter(([field, value]) => value && field !== 'worker_name' && field !== 'worker_phone')
                .map(([field, value]) => (
                  <p key={field}>
                    {FACT_LABELS[field] ?? field}: <strong>{letterValue(field, value)}</strong>
                  </p>
                ))}
              <p className="preview-note">
                {[coverNote(letter.letterType, paperFacts.notice_date), ...statements].join(' ')}
              </p>
              {later.length > 0 && (
                <p className="small">You said you'll send these later: {later.join(', ')}.</p>
              )}
              <p className="preview-label">It lists the papers the county asked for:</p>
              <ul className="send-list">
                {toSend.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            {chosen.length > 0 ? (
              <div className="card preview">
                <p className="preview-label">Then your photos</p>
                <div className="thumbs">
                  {papers
                    .filter((p) => chosen.includes(p.id))
                    .map((p) => (
                      <PaperThumb key={p.id} paper={p} />
                    ))}
                </div>
              </div>
            ) : (
              <p className="hint">No photos are in your reply. Remember to put the paper copies in the envelope.</p>
            )}

            {isStop && undoLetter && drafts && (
              <div className="card preview">
                <p className="preview-label">Then your letter asking the county to fix their mistake</p>
                <p className="draft-text">{drafts.rescission_letter}</p>
              </div>
            )}
            {isStop && hearing && (
              <div className="card preview">
                <p className="preview-label">Then your hearing request</p>
                <p>Why you think the county got it wrong:</p>
                <p className="draft-text">{reason}</p>
              </div>
            )}

            <button className="button primary big" onClick={() => go('sign')}>
              It looks right. Next, sign it
            </button>
            <p className="hint">Want to change something?</p>
            <div className="button-row">
              <button className="button" onClick={() => go('papers')}>
                The papers
              </button>
              <button className="button" onClick={() => setChanging(true)}>
                A date or number
              </button>
            </div>
            <button className="link" onClick={() => go('about')}>
              My name or address
            </button>
          </>
        )}

        {changing && (
          <>
            {mismatches && mismatches.length > 0 ? (
              <p className="error" role="alert">
                {mismatches.length === 1 ? 'One box does not match your letter.' : `${mismatches.length} boxes do not match your letter.`}{' '}
                Fix the yellow {mismatches.length === 1 ? 'box' : 'boxes'}.
              </p>
            ) : (
              <p className="lead">Change what is wrong, then tap Check again.</p>
            )}
            {Object.keys(paperFacts).map((field) => {
              const wrong = mismatches?.find((m) => m.field === field)
              return (
                <label key={field} className={`fact ${wrong ? 'flagged' : ''}`}>
                  <span className="fact-label">{FACT_LABELS[field] ?? field}</span>
                  <input value={paperFacts[field]} onChange={(e) => setPaperFacts({ ...paperFacts, [field]: e.target.value })} />
                  {wrong && <span className="fact-flag">Your letter says: {letterValue(field, wrong.fact)}</span>}
                </label>
              )
            })}
            <button className="button primary" onClick={() => runCheck()}>
              Check again
            </button>
          </>
        )}

        <button className="link" onClick={() => go('papers')}>
          Back
        </button>
      </>
    )
  }

  if (step === 'sign') {
    return (
      <>
        <span className="step">Step 3 of 4</span>
        <h1 className="page-title">Sign your reply</h1>
        <p className="lead">Sign in the box with your finger. When you sign, you're saying everything in your reply is true.</p>
        <SignaturePad onChange={setSignature} />
        {problem && <p className="error">{problem}</p>}
        <button className="button primary big" onClick={makePacket} disabled={!signature || working}>
          {working ? 'Putting your reply together…' : 'Sign and finish'}
        </button>
        <button className="link" onClick={() => go('check')}>
          Back
        </button>
      </>
    )
  }

  return <Done paper={made!} letterType={letter.letterType} onBack={onBack} />
}

// The packet is made. Print it or send it, then mark it sent.
export function Done({ paper, letterType, onBack }: { paper: Paper; letterType?: string; onBack: () => void }) {
  const [sent, setSent] = useState(false)

  async function markSent() {
    await addEvent({
      date: todayOnThisPhone(),
      type: 'papers_sent',
      description: 'Sent my reply packet',
      subject: 'You',
      proof: `${paper.name} (${shortPrint(paper.sha256)})`,
    })
    setSent(true)
  }

  return (
    <>
      <span className="step">Step 4 of 4</span>
      <h1 className="page-title">Your reply is ready</h1>
      <p className="all-good">✓ We saved it in My papers</p>
      <button className="button primary big" onClick={() => printOrSend(paper)}>
        Print it or send it
      </button>
      <div className="card">
        <h2>Now send it to the county</h2>
        <ol className="checklist">
          <li>Print it.</li>
          <li>
            {letterType === 'MC210_RV'
              ? 'Put it in an envelope with your renewal form, the property form, and any paper copies you didn\'t take a photo of.'
              : 'Put it in an envelope with any paper copies you didn\'t take a photo of.'}
          </li>
          <li>Mail it, fax it, or take it to your county office.</li>
          <li>If you go in person, ask them to stamp a copy with today's date. Keep that copy. It's your proof.</li>
        </ol>
      </div>
      {sent ? (
        <p className="all-good">✓ We wrote down that you sent it on {inWords(todayOnThisPhone(), false)}</p>
      ) : (
        <button className="button" onClick={markSent}>
          I sent it today
        </button>
      )}
      <p className="small">Saved with the code {shortPrint(paper.sha256)}. It shows later that your reply was never changed.</p>
      <button className="link" onClick={onBack}>
        Back to my letter
      </button>
    </>
  )
}

export function AboutForm({ about, letterText, onSave, onBack }: {
  about: AboutYou | null
  letterText?: string // the first time, the form is filled in from the letter
  onSave: (about: AboutYou) => void
  onBack: () => void
}) {
  // A first guess from the letter, read on the phone with no AI.
  const [guessed] = useState(() => (about ? {} : aboutFromLetter(letterText ?? '')))
  const [form, setForm] = useState<AboutYou>(
    about ?? { name: '', phone: '', street: '', city: '', zip: '', county: 'Santa Clara', ...guessed }
  )
  const field = (key: keyof AboutYou, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required {...extra} />
    </label>
  )
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(form)
      }}
    >
      <h1 className="page-title">About you</h1>
      <p className="lead">For the forms. This stays on your phone and is never sent to the AI.</p>
      {(guessed.name || guessed.street) && (
        <p className="hint">
          We filled this in from your letter. Please check your address. If you moved, type your new one.
        </p>
      )}
      {field('name', 'Your full name', { autoComplete: 'name' })}
      {field('phone', 'Your phone number', { inputMode: 'tel', autoComplete: 'tel' })}
      {field('street', 'Street address', { autoComplete: 'street-address' })}
      {field('city', 'City', { autoComplete: 'address-level2' })}
      {field('zip', 'ZIP code', { inputMode: 'numeric', autoComplete: 'postal-code' })}
      <div className="field">
        <span>Your county</span>
        {(['Santa Clara', 'San Mateo'] as const).map((county) => (
          <button
            type="button"
            key={county}
            className={`choice ${form.county === county ? 'on' : ''}`}
            onClick={() => setForm({ ...form, county })}
          >
            <strong>{form.county === county ? '✓ ' : ''}{county} County</strong>
          </button>
        ))}
      </div>
      <button type="submit" className="button primary">
        Save
      </button>
      <button type="button" className="button" onClick={onBack}>
        Back to my letter
      </button>
    </form>
  )
}

// A small picture of a saved paper, for looking over the reply.
function PaperThumb({ paper }: { paper: Paper }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const address = URL.createObjectURL(paper.file)
    setUrl(address)
    return () => URL.revokeObjectURL(address)
  }, [paper])
  return (
    <figure className="thumb">
      {paper.type.startsWith('image/') && url ? <img src={url} alt="" /> : <span>PDF</span>}
      <figcaption>{paper.name}</figcaption>
    </figure>
  )
}

// What the letter says, written for people: dates in words. The forms write
// dates as 08/28/2026, the letter facts as 2026-08-28.
function letterValue(field: string, value: string): string {
  if (!field.endsWith('_date')) return value
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  const iso = us ? `${us[3]}-${us[1]}-${us[2]}` : value
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? inWords(iso, false) : value
}

export async function fetchForm(path: string): Promise<Uint8Array> {
  const response = await fetch(path)
  if (!response.ok) throw new Error('A form could not be loaded. Please try again with internet.')
  return new Uint8Array(await response.arrayBuffer())
}
