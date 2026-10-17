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
import { LETTER_NAMES, plain } from './words'
import Confirm from './Confirm'

const HANDLED = ['MC_239A', 'MC355', 'MC210_RV']

// The model is loaded once and kept, since it never changes while the app runs.
let model: Model | null = null

type Read = {
  ocr: OcrResult
  readerB: string
  readerA: string | null
  aiFacts: AiFacts | null
  decision: Decision
}

type Stage =
  | { name: 'idle' }
  | { name: 'reading'; progress: number; almostDone: boolean }
  | { name: 'done'; read: Read }
  | { name: 'error'; message: string }

export default function Capture({ onDone }: { onDone: (letter: SavedLetter) => void }) {
  const [mode, setMode] = useState<ReadingMode | null>(loadMode)
  const [stage, setStage] = useState<Stage>({ name: 'idle' })
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
  }

  async function handlePhoto(file: Blob) {
    setStage({ name: 'reading', progress: 0, almostDone: false })
    try {
      const image = await prepareImage(file)
      setPhotoUrl(URL.createObjectURL(image))
      const ocr = await readText(image, (progress) => setStage({ name: 'reading', progress, almostDone: false }))
      // Reader B: Neil's classifier, running on the phone.
      model ??= await loadModel()
      const readerB = predict(model, ocr.text).letterType
      // Reader A: the AI, through the backend, only if the user allowed it.
      let aiFacts: AiFacts | null = null
      if (mode === 'ai') {
        setStage({ name: 'reading', progress: 1, almostDone: true })
        aiFacts = (await askReaderA(ocr.text))?.facts ?? null
      }
      const readerA = (aiFacts?.letter_type as string | null | undefined) ?? null
      // Neil's must-agree rule decides what happens next.
      setStage({ name: 'done', read: { ocr, readerB, readerA, aiFacts, decision: decide(readerA, readerB) } })
    } catch (error) {
      console.error(error)
      setStage({ name: 'error', message: 'We could not read that photo. Please try again.' })
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
        <h1 className="page-title">Read a letter</h1>
        <span className="step">Step 1 of 3</span>
        <p className="lead">Take a photo of the first page of your Medi-Cal letter.</p>
        {stage.name === 'error' && <p className="error">{stage.message}</p>}
        <label className="button primary">
          <CameraIcon />
          Take a photo
          <input type="file" accept="image/*" capture="environment" onChange={handleFileInput} hidden />
        </label>
        <label className="button">
          Choose a photo I already took
          <input type="file" accept="image/*" onChange={handleFileInput} hidden />
        </label>
        {import.meta.env.DEV && (
          <button className="button quiet" onClick={useSampleLetter}>
            Use a sample letter (only while building)
          </button>
        )}
        <div className="card">
          <h2>Tips for a good photo</h2>
          <p>Lay the letter flat on a table, in good light.</p>
          <p>Fit the whole page in the picture.</p>
          <p>The photo stays on your phone.</p>
        </div>
        <p className="hint">
          {mode === 'ai' ? 'Using AI help to read.' : 'Reading on your phone only.'}{' '}
          <button className="link" onClick={() => setMode(null)}>
            Change
          </button>
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className="page-title">{stage.name === 'reading' ? 'Reading your letter' : 'Check your letter'}</h1>
      <span className="step">Step {stage.name === 'reading' ? 1 : 2} of 3</span>
      {photoUrl && <img className="photo" src={photoUrl} alt="Your letter" />}

      {stage.name === 'reading' && (
        <div className="card" role="status">
          <h2>{stage.almostDone ? 'Almost done…' : 'Reading the words…'}</h2>
          <progress value={stage.progress} max={1} />
          <p>This takes a few seconds. Please keep this screen open.</p>
        </div>
      )}

      {stage.name === 'done' && (
        <AfterReading read={stage.read} mode={mode} onDone={onDone} onRetake={startOver} />
      )}

      {stage.name === 'done' && import.meta.env.DEV && (
        <details className="dev">
          <summary>What the app read (only while building)</summary>
          <p>Reader A (AI): {stage.read.readerA ?? 'not used'}</p>
          <p>Reader B (classifier): {stage.read.readerB}</p>
          <p>Photo reading confidence: {Math.round(stage.read.ocr.confidence)}%</p>
          <pre className="ocr-text">{stage.read.ocr.text.trim() || 'No words found in this photo.'}</pre>
        </details>
      )}
    </>
  )
}

// Everything after both readers have answered: settle the letter type, then
// check the facts.
function AfterReading({ read, mode, onDone, onRetake }: {
  read: Read
  mode: ReadingMode
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
      Take a new photo
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
        <h2>Which letter is this?</h2>
        <p>We are not sure. Look at the title at the top of your letter. Which one matches?</p>
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
        <h2>This letter is</h2>
        <p className="big-answer">{plain(picked)}</p>
        {decision.status === 'agree' && (
          <p className="checked-twice">
            <CheckIcon /> We checked it two different ways. Both agree.
          </p>
        )}
      </div>
      <CheckFacts
        read={read}
        mode={mode}
        letterType={picked}
        onConfirm={(facts) => onDone({ letterType: picked, facts, mode, text: read.ocr.text, savedAt: new Date().toISOString() })}
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
        <h2>We think this letter is</h2>
        <p className="big-answer">{plain(guess)}</p>
        <p>Is that right? Look at the title at the top of your letter.</p>
        <div className="button-row">
          <button className="button primary" onClick={onYes}>
            Yes
          </button>
          <button className="button" onClick={() => setChoosing(true)}>
            No
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="card">
      <h2>Which one is it?</h2>
      {HANDLED.map((type) => (
        <button key={type} className="choice" onClick={() => onPick(type)}>
          <strong>{LETTER_NAMES[type]}</strong>
        </button>
      ))}
      <button className="choice" onClick={onNone}>
        <strong>None of these</strong>
      </button>
      {retake}
    </div>
  )
}

// Builds the confirm screen: the AI's facts where there are some, the
// phone's own finds for the rest, and the case number always from the phone
// (the AI never sees it).
function CheckFacts({ read, mode, letterType, onConfirm }: {
  read: Read
  mode: ReadingMode
  letterType: string
  onConfirm: (facts: Record<string, string | null>) => void
}) {
  const today = todayOnThisPhone()
  const fields = fieldsFor(letterType)
  const local = findFacts(read.ocr.text, letterType, today)
  const repaired = [...local.repaired]
  const facts: Record<string, string | null> = {}
  for (const field of fields) {
    const fromAi = field === 'case_number' ? null : read.aiFacts?.[field]
    const fromPhone = (local.facts as Record<string, string | null>)[field] ?? null
    if (typeof fromAi === 'string' && fromAi) {
      facts[field] = fromAi
    } else {
      facts[field] = fromPhone
      // In AI mode, a fact only the phone found is less sure, so check it.
      if (mode === 'ai' && fromPhone && field !== 'case_number') repaired.push(field)
    }
  }
  const flags = flagsFor({
    fields,
    facts,
    mode,
    certainty: (read.aiFacts?.certainty as string | undefined) ?? null,
    photoConfidence: read.ocr.confidence,
    repaired,
    today,
  })
  return <Confirm fields={fields} facts={facts} flags={flags} onConfirm={onConfirm} />
}

// Neil's choice before scanning.
function ModeChoice({ onChoose }: { onChoose: (mode: ReadingMode) => void }) {
  return (
    <>
      <h1 className="page-title">Before we start</h1>
      <p className="lead">How should we read your letter? You can change this later.</p>
      <button className="choice" onClick={() => onChoose('ai')}>
        <strong>Use AI to help read it</strong>
        <span>
          More accurate, and it explains the letter in plain words. Your name, address and case number are
          hidden before anything is sent.
        </span>
      </button>
      <button className="choice" onClick={() => onChoose('phone')}>
        <strong>Keep everything on my phone</strong>
        <span>Nothing leaves your phone. You will need to check every detail yourself.</span>
      </button>
    </>
  )
}

function NotHandled({ retake }: { retake: React.ReactNode }) {
  return (
    <div className="card">
      <h2>Sorry, we can't help with this letter yet</h2>
      <p>This app works with three Medi-Cal letters:</p>
      <p>
        {LETTER_NAMES.MC210_RV}, {LETTER_NAMES.MC355.toLowerCase()}, and{' '}
        {LETTER_NAMES.MC_239A.toLowerCase()}.
      </p>
      <p>If this is one of them, try a new photo of the first page.</p>
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
