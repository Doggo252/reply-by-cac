// The scan screen, from photo to checked facts:
//   1. choose how the letter is read (Neil's choice: AI help, or phone only)
//   2. take a photo, and the phone reads the words
//   3. the two readers say what kind of letter it is (Neil's must-agree rule)
//   4. the user checks the facts (the confirm screen, with Neil's flags)
// Then it hands the checked letter to App, which shows what to do.
//
// The user never sees "Reader A" or "Reader B". When both agree, the screen
// just says it was checked two ways. When they disagree, it asks which letter
// it is, in plain words.
//
// It uses the phone's own camera app (a file input with `capture`) instead of
// a live camera view inside the page. Two reasons: browsers only allow a live
// camera on https, and the phone's camera app already has focus, flash and
// zoom that people know how to use.
import { useEffect, useState } from 'react'
import { prepareImage } from './image'
import { readText, type OcrResult } from './ocr'
import { loadModel, predict, type Model } from './classify'
import { askReaderA, type Facts as AiFacts } from './readerA'
import { decide, type Decision } from './agree'
import { findFacts } from './localFacts'
import { fieldsFor, flagsFor, type ReadingMode } from './flags'
import { todayOnThisPhone } from './deadlines'
import { loadMode, saveMode, type SavedLetter } from './storage'
import { plain } from './words'
import { t } from './language'
import Confirm from './Confirm'
import { usPhone } from './packet'
import { useOnline, wakeUpAI } from './online'
import { aboutFromLetter } from './aboutFromLetter'

const HANDLED = ['MC_239A', 'MC355', 'MC210_RV']

// The model is loaded once and kept, since it never changes while the app runs.
let model: Model | null = null

// "What the app read" shows while building, and on the real site when the
// address ends in ?debug, so a problem on a phone can be seen on that phone.
const SHOW_READING = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')

// Does the photo need a second, cleaner look? Yes if the phone missed one of
// the facts it can usually find, or the person's address.
function needsSecondLook(text: string, letterType: string): boolean {
  if (!HANDLED.includes(letterType)) return false
  const found = findFacts(text, letterType, todayOnThisPhone()).facts as Record<string, string | null>
  return fieldsFor(letterType).some((field) => field !== 'ask' && !found[field]) || !aboutFromLetter(text).street
}

// Both looks at the photo together, for the phone's own fact finding.
const allText = (read: Read) => [read.ocr.text, read.secondText].filter(Boolean).join('\n')

type Read = {
  ocr: OcrResult
  secondText: string // the second, cleaner look, if one was needed ('' if not)
  readerB: string
  readerA: string | null
  aiFacts: AiFacts | null
  decision: Decision
  aiMissed: boolean // AI mode, but the AI could not be reached
}

type Stage =
  | { name: 'idle' }
  | { name: 'reading'; progress: number; almostDone: boolean; waking?: boolean }
  | { name: 'done'; read: Read }
  | { name: 'error'; message: string }

export default function Capture({ onDone }: { onDone: (letter: SavedLetter) => void }) {
  const [mode, setMode] = useState<ReadingMode | null>(loadMode)
  const [stage, setStage] = useState<Stage>({ name: 'idle' })
  const online = useOnline()
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  // A preview address made with createObjectURL holds memory until it is
  // released, so release the old one whenever the photo changes.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [photoUrl])

  function chooseMode(choice: ReadingMode) {
    saveMode(choice)
    setMode(choice)
    if (choice === 'ai') wakeUpAI()
  }

  async function handlePhoto(file: Blob) {
    setStage({ name: 'reading', progress: 0, almostDone: false })
    try {
      // An upright copy to show beside the facts. readText makes its own.
      const image = await prepareImage(file)
      setPhotoUrl(URL.createObjectURL(image))
      const ocr = await readText(file, (progress) => setStage({ name: 'reading', progress, almostDone: false }))
      // Reader B: Neil's classifier, running on the phone.
      model ??= await loadModel()
      const readerB = predict(model, ocr.text).letterType
      // A second, cleaner look at the photo when the first one missed a fact
      // or the address (a thin typewriter font, or a shadow: Oct 21 and 22
      // tests). It runs while the AI reads the letter.
      const second = needsSecondLook(ocr.text, readerB)
        ? readText(file, () => {}, 'clean').then((reading) => reading.text, () => '')
        : Promise.resolve('')
      setStage({ name: 'reading', progress: 1, almostDone: true })
      // Reader A: the AI, through the backend, only if the user allowed it.
      let aiFacts: AiFacts | null = null
      if (mode === 'ai') {
        const waking = () => setStage({ name: 'reading', progress: 1, almostDone: true, waking: true })
        aiFacts = (await askReaderA(ocr.text, waking))?.facts ?? null
      }
      const secondText = await second
      const readerA = (aiFacts?.letter_type as string | null | undefined) ?? null
      // Neil's must-agree rule decides what happens next.
      const aiMissed = mode === 'ai' && aiFacts === null
      setStage({ name: 'done', read: { ocr, secondText, readerB, readerA, aiFacts, decision: decide(readerA, readerB), aiMissed } })
    } catch (error) {
      console.error(error)
      setStage({ name: 'error', message: t('We could not read that photo. Please try again.') })
    }
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clear the input so picking the same photo twice still counts as a change.
    event.target.value = ''
    if (file) handlePhoto(file)
  }

  // Only while developing: read a built-in fake letter, for computers with
  // no camera.
  async function useSampleLetter() {
    const response = await fetch('/sample-letter.jpg')
    handlePhoto(await response.blob())
  }

  function startOver() {
    setPhotoUrl(null)
    setStage({ name: 'idle' })
  }

  if (!mode) return <ModeChoice onChoose={chooseMode} />

  if (stage.name === 'idle' || stage.name === 'error') {
    return (
      <>
        <h1 className="page-title">{t('Take a photo of your letter')}</h1>
        <p className="lead">{t("Start with the first page of your Medi-Cal letter. We'll read it and tell you what to do.")}</p>
        {stage.name === 'error' && <p className="error">{stage.message}</p>}
        <label className="button primary">
          <CameraIcon />
          {t('Take a photo')}
          <input type="file" accept="image/*" capture="environment" onChange={handleFileInput} hidden />
        </label>
        <label className="button">
          {t('Choose a photo I already took')}
          <input type="file" accept="image/*" onChange={handleFileInput} hidden />
        </label>
        {import.meta.env.DEV && (
          <button className="button quiet" onClick={useSampleLetter}>
            Use a sample letter (only while building)
          </button>
        )}
        <div className="card">
          <h2>{t('For a clear photo')}</h2>
          <p>{t("Lay the letter flat on a table, where there's good light.")}</p>
          <p>{t('Get the whole page in the picture.')}</p>
          <p>{t("Keep your phone's shadow off the paper.")}</p>
          <p>{t('The photo stays on your phone.')}</p>
        </div>
        {mode === 'ai' && !online ? (
          <p className="notice">{t("You're offline, so the AI can't help read it right now. We'll read it on your phone, and you can check every fact.")}</p>
        ) : (
          <p className="hint">
            {mode === 'ai' ? t("We'll use AI to help read it.") : t("We'll read it on your phone only.")}{' '}
            <button className="link" onClick={() => setMode(null)}>
              {t('Change')}
            </button>
          </p>
        )}
      </>
    )
  }

  return (
    <>
      <h1 className="page-title">{stage.name === 'reading' ? t('Reading your letter') : t('Check what we read')}</h1>
      {photoUrl && <img className="photo" src={photoUrl} alt={t('Your letter')} />}

      {stage.name === 'reading' && (
        <div className="card" role="status">
          <h2>{stage.waking ? t('Waking up the AI…') : stage.almostDone ? t('Almost done…') : t('Reading your letter…')}</h2>
          <progress value={stage.progress} max={1} />
          <p>
            {stage.waking
              ? t('The first time in a while, this can take up to a minute. Keep this screen open.')
              : t('This takes a few seconds. Keep this screen open.')}
          </p>
        </div>
      )}

      {stage.name === 'done' && stage.read.aiMissed && (
        <p className="notice">
          {navigator.onLine
            ? t("We couldn't reach the AI just now, so your phone read the letter by itself. Please check each fact.")
            : t("You're offline, so your phone read the letter by itself. Please check each fact.")}
        </p>
      )}
      {stage.name === 'done' && (
        <AfterReading read={stage.read} mode={mode} photoUrl={photoUrl} onDone={onDone} onRetake={startOver} />
      )}

      {stage.name === 'done' && SHOW_READING && (
        <details className="dev">
          <summary>What the app read (only while building)</summary>
          <p>Reader A (AI): {stage.read.readerA ?? (stage.read.aiMissed ? 'could not reach the AI' : 'not used')}</p>
          <p>Reader B (classifier): {stage.read.readerB}</p>
          <p>Photo reading confidence: {Math.round(stage.read.ocr.confidence)}%</p>
          <pre className="ocr-text">{stage.read.ocr.text.trim() || 'No words found in this photo.'}</pre>
          {stage.read.secondText && (
            <>
              <p>Second, cleaner look:</p>
              <pre className="ocr-text">{stage.read.secondText.trim()}</pre>
            </>
          )}
        </details>
      )}
    </>
  )
}

// Everything after both readers have answered: settle the letter type, then
// check the facts.
function AfterReading({ read, mode, photoUrl, onDone, onRetake }: {
  read: Read
  mode: ReadingMode
  photoUrl: string | null
  onDone: (letter: SavedLetter) => void
  onRetake: () => void
}) {
  const { decision } = read
  // The letter type once it is settled. When both readers agree it is
  // settled already; otherwise the user settles it below.
  const [picked, setPicked] = useState<string | null>(decision.status === 'agree' ? decision.letterType : null)
  // "It's none of these" from the user.
  const [noneOfThese, setNoneOfThese] = useState(false)

  const retake = (
    <button className="button" onClick={onRetake}>
      {t('Take a new photo')}
    </button>
  )

  if (decision.status === 'not_handled' || noneOfThese || (decision.status === 'confirm' && decision.letterType === 'OTHER')) {
    return <NotHandled retake={retake} />
  }

  if (!picked) {
    // Only one reader looked (no AI). Ask the user to make sure.
    if (decision.status === 'confirm') {
      return (
        <OnlyOneCheck
          guess={decision.letterType!}
          onYes={() => setPicked(decision.letterType)}
          onPick={setPicked}
          onNone={() => setNoneOfThese(true)}
          retake={retake}
        />
      )
    }
    // The two readers disagree. Neil's rule: the user picks between them.
    return (
      <div className="card">
        <h2>{t('Which letter is this?')}</h2>
        <p>{t("We're not sure. Look at the title at the top of your letter. Which one is it?")}</p>
        {decision.choices.map((choice) => (
          <button key={choice} className="choice" onClick={() => setPicked(choice)}>
            <strong>{plain(choice)}</strong>
          </button>
        ))}
        {retake}
      </div>
    )
  }

  if (!HANDLED.includes(picked)) return <NotHandled retake={retake} />

  return (
    <>
      <div className="card">
        <h2>{t('This is')}</h2>
        <p className="big-answer">{plain(picked)}</p>
        {decision.status === 'agree' && (
          <p className="checked-twice">
            <CheckIcon /> {t('We checked it two ways, and both agree.')}
          </p>
        )}
      </div>
      <CheckFacts
        read={read}
        mode={mode}
        photoUrl={photoUrl}
        letterType={picked}
        onConfirm={(facts) =>
          onDone({ letterType: picked, facts, mode, text: read.ocr.text, addressText: read.secondText || undefined, savedAt: new Date().toISOString() })
        }
      />
      {retake}
    </>
  )
}

// Only Neil's classifier read the letter, so the user makes sure.
function OnlyOneCheck({ guess, onYes, onPick, onNone, retake }: {
  guess: string
  onYes: () => void
  onPick: (type: string) => void
  onNone: () => void
  retake: React.ReactNode
}) {
  const [choosing, setChoosing] = useState(false)
  if (!choosing) {
    return (
      <div className="card">
        <h2>{t('We think this letter is')}</h2>
        <p className="big-answer">{plain(guess)}</p>
        <p>{t('Is that right? Look at the title at the top of your letter.')}</p>
        <div className="button-row">
          <button className="button primary" onClick={onYes}>
            {t('Yes')}
          </button>
          <button className="button" onClick={() => setChoosing(true)}>
            {t('No')}
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="card">
      <h2>{t('Which one is it?')}</h2>
      {HANDLED.map((type) => (
        <button key={type} className="choice" onClick={() => onPick(type)}>
          <strong>{plain(type)}</strong>
        </button>
      ))}
      <button className="choice" onClick={onNone}>
        <strong>{t('None of these')}</strong>
      </button>
      {retake}
    </div>
  )
}

// Builds the confirm screen: the AI's facts where there are some, the
// phone's own finds for the rest, and the case number always from the phone
// (the AI never sees it).
function CheckFacts({ read, mode, photoUrl, letterType, onConfirm }: {
  read: Read
  mode: ReadingMode
  photoUrl: string | null
  letterType: string
  onConfirm: (facts: Record<string, string | null>) => void
}) {
  const today = todayOnThisPhone()
  const fields = fieldsFor(letterType)
  const local = findFacts(allText(read), letterType, today)
  const repaired = [...local.repaired]
  const facts: Record<string, string | null> = {}
  for (const field of fields) {
    const fromAi = field === 'case_number' ? null : read.aiFacts?.[field]
    const fromPhone = (local.facts as Record<string, string | null>)[field] ?? null
    // On a stopped letter, the phone finds the exact reason sentence ("You did
    // not send..."), which lists the missing papers. The AI sometimes picks a
    // different sentence, so the phone's wins for "what the county is asking for".
    // An AI answer with a blanked word in it ("Fatima [name]", when the worker
    // shares the person's last name) is not used; the phone read the real text.
    const blanked = typeof fromAi === 'string' && /\[\w+\]/.test(fromAi)
    if (field === 'ask' && letterType === 'MC_239A' && fromPhone) {
      facts[field] = fromPhone
    } else if (typeof fromAi === 'string' && fromAi && !blanked) {
      facts[field] = fromAi
    } else {
      facts[field] = fromPhone
      // In AI mode, a fact only the phone found is less sure, so check it.
      if (mode === 'ai' && fromPhone && field !== 'case_number') repaired.push(field)
    }
  }
  // "6509211395" becomes "(650) 921-1395", the way people write it.
  if (facts.worker_phone) facts.worker_phone = usPhone(facts.worker_phone)
  const flags = flagsFor({
    fields,
    facts,
    mode,
    certainty: (read.aiFacts?.certainty as string | undefined) ?? null,
    photoConfidence: read.ocr.confidence,
    repaired,
    today,
  })
  return (
    <Confirm
      fields={fields}
      facts={facts}
      flags={flags}
      text={allText(read)}
      photoUrl={photoUrl}
      letterType={letterType}
      onConfirm={onConfirm}
    />
  )
}

// Neil's choice before scanning. It is the only time the app asks about AI
// (Neil, Oct 20), so it says plainly what each choice can and can't do, and
// what is sent to the AI. Choosing AI here is the consent the AI helper needs
// (agent/TOOLS.md, Section 1).
function ModeChoice({ onChoose }: { onChoose: (mode: ReadingMode) => void }) {
  return (
    <>
      <h1 className="page-title">{t("Hi! We'll help you answer your Medi-Cal letter.")}</h1>
      <p className="lead">{t('First, choose how much help you want. We only ask this once, and you can change it later.')}</p>
      <button className="choice mode" onClick={() => onChoose('ai')}>
        <strong>{t('Read it with AI (most accurate)')}</strong>
        <span className="mode-line">✓ {t('Reads your letter and explains it in plain words')}</span>
        <span className="mode-line">✓ {t('Fills in your form, and reads your papers to fill in what you leave blank')}</span>
        <span className="mode-line">✓ {t('Checks if the county made a mistake, and writes a letter to fix it')}</span>
        <span className="mode-note">
          {t('We take out your name, address and case number first. Only words are sent: your letter, what you write down, and your papers. Your photos and signature stay on your phone.')}
        </span>
      </button>
      <button className="choice mode" onClick={() => onChoose('phone')}>
        <strong>{t('Read it on my phone only (most private)')}</strong>
        <span className="mode-line">✓ {t('Nothing leaves your phone, and it works without internet')}</span>
        <span className="mode-line">✓ {t('Fills in your form from your answers. The phone reads some numbers from your photos, but you type more yourself')}</span>
        <span className="mode-line">✗ {t('No explanation of the letter, and no letters to the county written for you')}</span>
      </button>
      <p className="hint">{t('Either way, we fill in the forms with you and walk you through every step.')}</p>
    </>
  )
}

function NotHandled({ retake }: { retake: React.ReactNode }) {
  return (
    <div className="card">
      <h2>{t("Sorry, we can't help with this letter yet")}</h2>
      <p>{t('Right now we can help with three Medi-Cal letters:')}</p>
      <ul className="send-list">
        <li>{plain('MC210_RV')}</li>
        <li>{plain('MC355')}</li>
        <li>{plain('MC_239A')}</li>
      </ul>
      <p>{t('If this is one of them, try a new photo of the first page.')}</p>
      {retake}
    </div>
  )
}

const CameraIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
)

const CheckIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
    <path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
