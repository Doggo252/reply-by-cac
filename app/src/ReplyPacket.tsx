// "Manually prepare my response": the steps from a checked letter to a signed packet.
//   1. About you      name and address for the forms (kept on this phone)
//   2. What goes in   the forms for this letter, and papers from the vault
//   3. Check          Neil's checker compares the papers to the letter
//   4. Sign           only once the check passes
//   5. Done           the packet is saved to My papers, ready to print or share
//
// Each step is one plain function underneath (fill, check, sign, build), so
// the AI helper (AgentHelper.tsx) runs the same steps, under Neil's rules in
// agent/TOOLS.md.
import { useEffect, useState } from 'react'
import { check, type Mismatch } from './checker'
import { aboutFromLetter } from './aboutFromLetter'
import { buildPacket, paperFactsFrom, type AboutYou, type Attachment, type PacketInput, type PaperFacts } from './packet'
import { addEvent, addPaper, listPapers, loadAbout, loadDrafts, saveAbout, type Paper, type SavedLetter } from './storage'
import { todayOnThisPhone } from './deadlines'
import { shortPrint } from './fingerprint'
import { FACT_LABELS, inWords, savedOn } from './words'
import SignaturePad from './SignaturePad'

type Step = 'about' | 'contents' | 'check' | 'sign' | 'done'

// The sections of the MC 210 RV to fill in by hand, with their page numbers
// on the October 2020 form. The property part matters again since 2026
// (ACWDL 25-14).
const RENEWAL_CHECKLIST = [
  'Page 2: your contact information. Check the box if it is still right.',
  'Pages 3 to 4: who lives with you.',
  'Pages 5 to 7: income. Attach proof, like a Social Security letter.',
  'Page 8: expenses. Attach proof.',
  'Pages 9 to 10: money and property, like bank accounts. Attach a bank statement.',
  'The property insert that came with the form (new in 2026). Fill it in too.',
  'Page 11: Medicare.',
  'Pages 12 to 15: long-term care, other insurance, and household changes.',
  'Page 17: sign and date. This app makes a signed copy of this page for you.',
]

export default function ReplyPacket({ letter, onBack }: { letter: SavedLetter; onBack: () => void }) {
  const [step, setStep] = useState<Step>(loadAbout() ? 'contents' : 'about')
  const [about, setAbout] = useState<AboutYou | null>(loadAbout)
  const drafts = loadDrafts()
  const isStop = letter.letterType === 'MC_239A'
  const [hearing, setHearing] = useState(isStop)
  const [reason, setReason] = useState(drafts?.hearing_reason ?? '')
  const [undoLetter, setUndoLetter] = useState(isStop && !!drafts)
  const [papers, setPapers] = useState<Paper[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  // The facts as written on the papers. The person can change them here,
  // which is exactly what the checker is for.
  const [paperFacts, setPaperFacts] = useState<PaperFacts>(() => paperFactsFrom(letter.facts))
  const [mismatches, setMismatches] = useState<Mismatch[] | null>(null)
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

  // Neil's checker: the papers against the facts the person confirmed.
  function runCheck() {
    const confirmed = Object.fromEntries(Object.entries(letter.facts).filter(([field]) => field !== 'ask'))
    setMismatches(check(paperFacts, confirmed))
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
      setProblem(error instanceof Error ? error.message : 'We could not make the packet. Please try again.')
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
          go('contents')
        }}
      />
    )
  }

  if (step === 'contents') {
    return (
      <>
        <h1 className="page-title">What goes in your reply</h1>
        <span className="step">Part 1 of 3</span>

        {isStop && (
          <>
            <button className={`choice ${hearing ? 'on' : ''}`} onClick={() => setHearing(!hearing)}>
              <strong>{hearing ? '✓ ' : ''}Ask for a hearing</strong>
              <span>A judge reviews the county's decision. Asking before your Medi-Cal stops keeps it on while you wait.</span>
            </button>
            {hearing && (
              <label className="field">
                <span>Why do you disagree?</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Like: I sent my papers on time." />
              </label>
            )}
            {drafts ? (
              <button className={`choice ${undoLetter ? 'on' : ''}`} onClick={() => setUndoLetter(!undoLetter)}>
                <strong>{undoLetter ? '✓ ' : ''}Letter asking the county to restore my Medi-Cal</strong>
                <span>The letter written from your timeline.</span>
              </button>
            ) : (
              <p className="hint">If the county made a mistake, My timeline can write a letter asking them to fix it.</p>
            )}
          </>
        )}

        {letter.letterType === 'MC355' && (
          <div className="card">
            <h2>The county asked for</h2>
            <p>{letter.facts.ask ?? 'Look at your letter to see what they asked for.'}</p>
            <p className="small">Pick those papers below. Take a photo of any you have not saved yet.</p>
          </div>
        )}

        {letter.letterType === 'MC210_RV' && (
          <div className="card">
            <h2>Fill in your renewal form by hand</h2>
            <p className="small">Do not retype it. Answer these parts on the paper form:</p>
            <ol className="checklist">
              {RENEWAL_CHECKLIST.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        )}

        <h2 className="section-title">Papers to send with it</h2>
        {papers.length === 0 && <p className="hint">No papers saved yet. Add photos in My papers.</p>}
        {papers
          .filter((p) => !p.name.startsWith('Reply packet'))
          .map((p) => {
            const on = chosen.includes(p.id)
            return (
              <button
                key={p.id}
                className={`choice ${on ? 'on' : ''}`}
                onClick={() => setChosen(on ? chosen.filter((id) => id !== p.id) : [...chosen, p.id])}
              >
                <strong>{on ? '✓ ' : ''}{p.name}</strong>
                <span>Saved {savedOn(p.addedAt)}</span>
              </button>
            )
          })}
        <label className="button">
          Take a photo of a paper
          <input
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              const paper = await addPaper(file, `Photo, ${savedOn(new Date().toISOString())}`)
              setPapers(await listPapers())
              setChosen((old) => [...old, paper.id])
            }}
          />
        </label>

        <button className="button primary" onClick={() => go('check')} disabled={isStop && hearing && !reason.trim()}>
          Next: check it
        </button>
        <button className="button" onClick={() => go('about')}>
          Change my name or address
        </button>
        <button className="button" onClick={onBack}>
          Back to my letter
        </button>
      </>
    )
  }

  if (step === 'check') {
    const passed = mismatches !== null && mismatches.length === 0
    return (
      <>
        <h1 className="page-title">Check your reply</h1>
        <span className="step">Part 2 of 3</span>
        <p className="lead">This is what will be written on your papers. We check it against your letter.</p>
        {mismatches && mismatches.length > 0 && (
          <p className="error" role="alert">
            {mismatches.length === 1 ? 'One thing does not match your letter.' : `${mismatches.length} things do not match your letter.`}{' '}
            Fix the yellow {mismatches.length === 1 ? 'box' : 'boxes'}, then check again.
          </p>
        )}
        {Object.keys(paperFacts).map((field) => {
          const wrong = mismatches?.find((m) => m.field === field)
          return (
            <label key={field} className={`fact ${wrong ? 'flagged' : ''}`}>
              <span className="fact-label">{FACT_LABELS[field] ?? field}</span>
              <input
                value={paperFacts[field]}
                onChange={(e) => {
                  setPaperFacts({ ...paperFacts, [field]: e.target.value })
                  setMismatches(null)
                }}
              />
              {wrong && <span className="fact-flag">Your letter says: {letterValue(field, wrong.fact)}</span>}
            </label>
          )
        })}

        {passed && (
          <p className="all-good" role="status">
            ✓ Everything matches your letter.
          </p>
        )}

        {passed ? (
          <button className="button primary" onClick={() => go('sign')}>
            Next: sign it
          </button>
        ) : (
          <button className="button primary" onClick={runCheck}>
            Check my reply
          </button>
        )}
        <button className="button" onClick={() => go('contents')}>
          Back
        </button>
      </>
    )
  }

  if (step === 'sign') {
    return (
      <>
        <h1 className="page-title">Sign your reply</h1>
        <span className="step">Part 3 of 3</span>
        <p className="lead">
          By signing, you say the information is true. Your signature goes on{' '}
          {isStop && hearing ? 'the hearing request' : letter.letterType === 'MC210_RV' ? 'page 17 of the renewal form' : 'the cover sheet'}
          {isStop && undoLetter && drafts ? ' and the letter' : ''}.
        </p>
        <SignaturePad onChange={setSignature} />
        {problem && <p className="error">{problem}</p>}
        <button className="button primary" onClick={makePacket} disabled={!signature || working}>
          {working ? 'Making your packet…' : 'Make my reply packet'}
        </button>
        <button className="button" onClick={() => go('check')}>
          Back
        </button>
      </>
    )
  }

  return <Done paper={made!} onBack={onBack} />
}

// The packet is made. Print it, share it, then mark it sent.
export function Done({ paper, onBack }: { paper: Paper; onBack: () => void }) {
  const [url] = useState(() => URL.createObjectURL(paper.file))
  const [sent, setSent] = useState(false)
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  async function share() {
    const file = new File([paper.file], paper.name, { type: 'application/pdf' })
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: paper.name }).catch(() => {})
    else window.open(url, '_blank')
  }

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
      <h1 className="page-title">Your reply is ready</h1>
      <p className="all-good">✓ Saved in My papers</p>
      <p className="lead">Fingerprint {shortPrint(paper.sha256)}. This proves later that the packet was not changed.</p>
      <a className="button primary" href={url} target="_blank" rel="noreferrer">
        Open it to print
      </a>
      <button className="button" onClick={share}>
        Share it (email, text, or upload)
      </button>
      <div className="card">
        <h2>How to send it</h2>
        <p>Mail it, fax it, or bring it to your county office. Keep the receipt or a photo of the envelope.</p>
        <p>Ask the office to stamp a copy with the date. That copy is your best proof.</p>
      </div>
      {sent ? (
        <p className="all-good">✓ Added to My timeline for {inWords(todayOnThisPhone(), false)}</p>
      ) : (
        <button className="button" onClick={markSent}>
          I sent it today
        </button>
      )}
      <button className="button" onClick={onBack}>
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
      {Object.keys(guessed).length > 0 && (
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

// What the letter says, written for people: dates in words.
function letterValue(field: string, value: string): string {
  return field.endsWith('_date') && /^\d{4}-\d{2}-\d{2}$/.test(value) ? inWords(value, false) : value
}

export async function fetchForm(path: string): Promise<Uint8Array> {
  const response = await fetch(path)
  if (!response.ok) throw new Error('A form could not be loaded. Please try again with internet.')
  return new Uint8Array(await response.arrayBuffer())
}
