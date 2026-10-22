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
import { useState } from 'react'
import { check, type Mismatch } from './checker'
import { aboutFromLetter } from './aboutFromLetter'
import { buildPacket, paperFactsFrom, type AboutYou, type Attachment, type PacketInput, type PaperFacts } from './packet'
import { addEvent, addPaper, loadAbout, loadDrafts, saveAbout, textForAddress, type Paper, type SavedLetter } from './storage'
import { todayOnThisPhone } from './deadlines'
import { shortPrint } from './fingerprint'
import { factLabel, inWords, savedOn } from './words'
import { t } from './language'
import SignaturePad from './SignaturePad'
import PaperSteps from './PaperSteps'
import { printOrSend } from './printOrSend'
import { photoForPacket } from './image'
import PacketPreview from './PacketPreview'
import { usePapers } from './usePapers'
import { CoverPreview, PhotoPreview, RenewalPreview, StatementPreview, letterValue } from './ReplyPreview'

type Step = 'about' | 'papers' | 'check' | 'sign' | 'done'

export default function ReplyPacket({ letter, withHearing, onBack }: {
  letter: SavedLetter
  withHearing: boolean // the person tapped "Ask for a hearing"
  onBack: () => void
}) {
  const [step, setStep] = useState<Step>(loadAbout() ? 'papers' : 'about')
  const [about, setAbout] = useState<AboutYou | null>(loadAbout)
  const drafts = loadDrafts()
  const isStop = letter.letterType === 'MC_239A'
  // The papers: the same screens and answers as the AI helper (usePapers.ts).
  const { included, statements, later, papers, chosen, stepsProps, renewalForm, renewal, fromPapers } = usePapers(letter)
  const [hearing, setHearing] = useState(isStop && withHearing)
  const [reason, setReason] = useState(drafts?.hearing_reason ?? '')
  const [undoLetter, setUndoLetter] = useState(isStop && !!drafts)
  // The facts as written on the forms. The person can change them on the
  // check screen, which is exactly what the checker is for.
  const [paperFacts, setPaperFacts] = useState<PaperFacts>(() => paperFactsFrom(letter.facts))
  const [mismatches, setMismatches] = useState<Mismatch[] | null>(null)
  const [changing, setChanging] = useState(false)
  const [signature, setSignature] = useState<Uint8Array | null>(null)
  const [made, setMade] = useState<Paper | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

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

  // Everything that goes in the packet, with the signature or without it yet.
  async function packetInput(signed: Uint8Array | null): Promise<PacketInput> {
    const attachments: Attachment[] = await Promise.all(papers.filter((p) => chosen.includes(p.id)).map(attachmentFor))
    return {
      letterType: letter.letterType,
      about: about!,
      facts: paperFacts,
      today: todayOnThisPhone(),
      hearing: isStop && hearing ? { reason } : null,
      undoLetter: isStop && undoLetter && drafts ? drafts.rescission_letter : null,
      toSend: included,
      statements,
      later,
      renewal: renewalForm ? renewal : undefined,
      attachments,
      signature: signed,
      forms: await loadForms(renewalForm),
    }
  }

  async function makePacket() {
    setWorking(true)
    setProblem(null)
    try {
      const bytes = await buildPacket(await packetInput(signature), mismatches ?? [], true)
      const name = `Reply packet, ${savedOn(new Date().toISOString())}.pdf`
      const paper = await addPaper(new Blob([bytes as BlobPart], { type: 'application/pdf' }), name)
      setMade(paper)
      go('done')
    } catch (error) {
      console.error(error)
      setProblem(error instanceof Error ? error.message : t('We could not make your reply. Please try again.'))
    }
    setWorking(false)
  }

  if (step === 'about') {
    return (
      <AboutForm
        about={about}
        letterText={textForAddress(letter)}
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
      <PaperSteps {...stepsProps} step={t('Step 1 of 4')}>
        {isStop && drafts && (
          <button className={`choice ${undoLetter ? 'on' : ''}`} onClick={() => setUndoLetter(!undoLetter)}>
            <strong>{undoLetter ? '✓ ' : ''}{t('Add a letter asking the county to fix their mistake')}</strong>
            <span>{t('We wrote it from what you told us you sent.')}</span>
          </button>
        )}

        {isStop && (
          <>
            <button className={`choice ${hearing ? 'on' : ''}`} onClick={() => setHearing(!hearing)}>
              <strong>{hearing ? '✓ ' : ''}{t('Also ask for a hearing')}</strong>
              <span>{t('Only if you think the county got it wrong. A judge will look at it.')}</span>
            </button>
            {hearing && (
              <label className="field">
                <span>{t('Why do you think the county got it wrong?')}</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('For example: I mailed my papers on time.')} />
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
          {t('Next')}
        </button>
        {hearing && !reason.trim() && <p className="hint">{t('Tell us why, or untick the hearing.')}</p>}
        <button className="link" onClick={onBack}>
          {t('Back to my letter')}
        </button>
        <button className="link" onClick={() => go('about')}>
          {t('Change my name or address')}
        </button>
      </PaperSteps>
    )
  }

  if (step === 'check') {
    const passed = mismatches !== null && mismatches.length === 0
    return (
      <>
        <span className="step">{t('Step 2 of 4')}</span>
        <h1 className="page-title">{t('Look over your reply')}</h1>

        {passed && !changing && (
          <>
            <p className="lead">{t("This is what we'll send to the county. Read it through. You can change anything before you sign.")}</p>
            <p className="all-good" role="status">
              {t('✓ The dates and numbers match your letter.')}
            </p>
            {/* The real pages, unsigned. final=false: no signature check yet. */}
            <PacketPreview make={async () => buildPacket(await packetInput(null), mismatches ?? [], false)} />

            <CoverPreview
              letterType={letter.letterType}
              about={about!}
              facts={paperFacts}
              today={todayOnThisPhone()}
              toSend={included}
              statements={statements}
              later={later}
              hearing={isStop && hearing}
              undoLetter={isStop && undoLetter && !!drafts}
            />
            {renewalForm && (
              <RenewalPreview
                answers={renewal}
                fromPapers={fromPapers}
                onChange={() => {
                  stepsProps.renewal?.onStep('review')
                  go('papers')
                }}
              />
            )}
            {statements.length > 0 && <StatementPreview statements={statements} />}
            <PhotoPreview photos={papers.filter((p) => chosen.includes(p.id))} />

            {isStop && undoLetter && drafts && (
              <div className="card preview">
                <p className="preview-label">{t('Then your letter asking the county to fix their mistake')}</p>
                <p className="draft-text">{drafts.rescission_letter}</p>
              </div>
            )}
            {isStop && hearing && (
              <div className="card preview">
                <p className="preview-label">{t('Then your hearing request')}</p>
                <p>{t('Why you think the county got it wrong:')}</p>
                <p className="draft-text">{reason}</p>
              </div>
            )}

            <button className="button primary big" onClick={() => go('sign')}>
              {t('It looks right. Next, sign it')}
            </button>
            <p className="hint">{t('Want to change something?')}</p>
            <div className="button-row">
              <button className="button" onClick={() => go('papers')}>
                {t('The papers')}
              </button>
              <button className="button" onClick={() => setChanging(true)}>
                {t('A date or number')}
              </button>
            </div>
            <button className="link" onClick={() => go('about')}>
              {t('My name or address')}
            </button>
          </>
        )}

        {changing && (
          <>
            {mismatches && mismatches.length > 0 ? (
              <p className="error" role="alert">
                {mismatches.length === 1
                  ? t('One box does not match your letter. Fix the yellow box.')
                  : t('{n} boxes do not match your letter. Fix the yellow boxes.', { n: mismatches.length })}
              </p>
            ) : (
              <p className="lead">{t('Change what is wrong, then tap Check again.')}</p>
            )}
            {Object.keys(paperFacts).map((field) => {
              const wrong = mismatches?.find((m) => m.field === field)
              return (
                <label key={field} className={`fact ${wrong ? 'flagged' : ''}`}>
                  <span className="fact-label">{factLabel(field)}</span>
                  <input value={paperFacts[field]} onChange={(e) => setPaperFacts({ ...paperFacts, [field]: e.target.value })} />
                  {wrong && <span className="fact-flag">{t('Your letter says: {value}', { value: letterValue(field, wrong.fact) })}</span>}
                </label>
              )
            })}
            <button className="button primary" onClick={() => runCheck()}>
              {t('Check again')}
            </button>
          </>
        )}

        <button className="link" onClick={() => go('papers')}>
          {t('Back')}
        </button>
      </>
    )
  }

  if (step === 'sign') {
    return (
      <>
        <span className="step">{t('Step 3 of 4')}</span>
        <h1 className="page-title">{t('Sign your reply')}</h1>
        <p className="lead">{t("Sign in the box with your finger. When you sign, you're saying everything in your reply is true.")}</p>
        <SignaturePad onChange={setSignature} />
        {problem && <p className="error">{problem}</p>}
        <button className="button primary big" onClick={makePacket} disabled={!signature || working}>
          {working ? t('Putting your reply together…') : t('Sign and finish')}
        </button>
        <button className="link" onClick={() => go('check')}>
          {t('Back')}
        </button>
      </>
    )
  }

  return <Done paper={made!} letterType={letter.letterType} step={t('Step 4 of 4')} onBack={onBack} />
}

// The packet is made. Print it or send it, then mark it sent.
// `step` is "Step 4 of 4" in the step-by-step reply; the AI helper has no steps.
export function Done({ paper, letterType, step, onBack }: { paper: Paper; letterType?: string; step?: string; onBack: () => void }) {
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
      {step && <span className="step">{step}</span>}
      <h1 className="page-title">{t('Your reply is ready')}</h1>
      <p className="all-good">{t('✓ We saved it in My papers')}</p>
      <button className="button primary big" onClick={() => printOrSend(paper)}>
        {t('Print it or send it')}
      </button>
      <div className="card">
        <h2>{t('Now send it to the county')}</h2>
        <ol className="checklist">
          <li>{t('Print it.')}</li>
          <li>
            {letterType === 'MC210_RV'
              ? t("Put it in an envelope. Your filled-in renewal form is part of it. Add any paper copies you didn't take a photo of, and the property form if the county sent you one.")
              : t("Put it in an envelope with any paper copies you didn't take a photo of.")}
          </li>
          <li>{t('Mail it, fax it, or take it to your county office.')}</li>
          <li>{t("If you go in person, ask them to stamp a copy with today's date. Keep that copy. It's your proof.")}</li>
        </ol>
      </div>
      {sent ? (
        <p className="all-good">{t('✓ We wrote down that you sent it on {date}', { date: inWords(todayOnThisPhone(), false) })}</p>
      ) : (
        <button className="button" onClick={markSent}>
          {t('I sent it today')}
        </button>
      )}
      <p className="small">{t('Saved with the code {code}. It shows later that your reply was never changed.', { code: shortPrint(paper.sha256) })}</p>
      <button className="link" onClick={onBack}>
        {t('Back to my letter')}
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
      <span>{t(label)}</span>
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
      <h1 className="page-title">{t('About you')}</h1>
      <p className="lead">{t('For the forms. This stays on your phone and is never sent to the AI.')}</p>
      {(guessed.name || guessed.street) && (
        <p className="hint">
          {t('We filled this in from your letter. Please check your address. If you moved, type your new one.')}
        </p>
      )}
      {field('name', 'Your full name', { autoComplete: 'name' })}
      {field('phone', 'Your phone number', { inputMode: 'tel', autoComplete: 'tel' })}
      {field('street', 'Street address', { autoComplete: 'street-address' })}
      {field('city', 'City', { autoComplete: 'address-level2' })}
      {field('zip', 'ZIP code', { inputMode: 'numeric', autoComplete: 'postal-code' })}
      <div className="field">
        <span>{t('Your county')}</span>
        {(['Santa Clara', 'San Mateo'] as const).map((county) => (
          <button
            type="button"
            key={county}
            className={`choice ${form.county === county ? 'on' : ''}`}
            onClick={() => setForm({ ...form, county })}
          >
            <strong>{form.county === county ? '✓ ' : ''}{t('{county} County', { county })}</strong>
          </button>
        ))}
      </div>
      <button type="submit" className="button primary">
        {t('Save')}
      </button>
      <button type="button" className="button" onClick={onBack}>
        {t('Back to my letter')}
      </button>
    </form>
  )
}

// A saved paper, ready to go in the packet. Photos are turned upright and
// made smaller first (image.ts); a PDF goes in as it is.
export async function attachmentFor(paper: Paper): Promise<Attachment> {
  if (paper.type.startsWith('image/')) {
    try {
      return { name: paper.name, type: 'image/jpeg', bytes: await photoForPacket(paper.file) }
    } catch (error) {
      console.error(error) // fall back to the photo as it was taken
    }
  }
  return { name: paper.name, type: paper.type, bytes: new Uint8Array(await paper.file.arrayBuffer()) }
}

// The official forms a packet may need, from the app's own files.
export async function loadForms(renewalForm: boolean): Promise<PacketInput['forms']> {
  const [hearingRequest, renewalSignaturePage, renewalFormBytes] = await Promise.all([
    fetchForm('/forms/hearing-request.pdf'),
    fetchForm('/forms/mc210rv-signature-page.pdf'),
    renewalForm ? fetchForm('/forms/mc210rv.pdf') : Promise.resolve(undefined),
  ])
  return { hearingRequest, renewalSignaturePage, renewalForm: renewalFormBytes }
}

export async function fetchForm(path: string): Promise<Uint8Array> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(t('A form could not be loaded. Please try again with internet.'))
  return new Uint8Array(await response.arrayBuffer())
}
