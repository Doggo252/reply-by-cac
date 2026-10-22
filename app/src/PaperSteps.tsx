// The papers, one at a time. For each one the person sees what it is and
// where people usually find it, then picks one answer:
//   take a photo / I'll put the paper copy in / I don't have one / I can't find it
// Every photo is checked on the phone (photoCheck.ts): can it be read, is it
// the right paper, does it show their name, is it recent. If not, they can
// take it again or use it anyway.
//
// A request for papers (MC 355) starts with "Which boxes are checked?", since
// the list is on page 2 and up. A renewal (or a stop letter that asks for the
// renewal form) starts with the renewal form's questions (RenewalQuestions.tsx):
// the app fills in the form, then asks for the proof it needs.
// When every paper has an answer, it shows a summary, with `children` (the
// hearing and letter choices, and the Next button) under it.
import { useState } from 'react'
import { helpFor, MC355_BOXES } from './paperHelp'
import { checkPhoto, type PhotoCheck } from './photoCheck'
import { readPaper, readText } from './ocr'
import PhotoTip from './PhotoTip'
import { todayOnThisPhone } from './deadlines'
import { blankFacts, proofKind, renewalLines } from './renewalForm'
import { readProof } from './proofRead'
import RenewalQuestions, { type RenewalProps } from './RenewalQuestions'
import { RENEWAL_FORM } from './usePapers'
import { addPaper, listPapers, loadAbout, type Paper } from './storage'
import { savedOn } from './words'
import { t } from './language'

export type PaperAnswer = 'photo' | 'mail' | 'none' | 'later'

export default function PaperSteps(props: {
  letterType: string
  items: string[] | null // null: a request for papers, before the boxes are picked
  onItems: (items: string[]) => void
  answers: Record<string, PaperAnswer>
  onAnswer: (item: string, answer: PaperAnswer | null) => void
  papers: Paper[]
  chosen: string[]
  onChosen: (ids: string[]) => void
  onPapersChanged: (papers: Paper[]) => void
  renewal: RenewalProps | null // the renewal form's questions, when the reply needs the form
  canSayNone: (item: string) => boolean // "I don't have it" makes sense for this paper
  step?: string // "Step 1 of 4" in the step-by-step reply; none with the AI helper
  children: React.ReactNode
}) {
  const { letterType, items, answers, onAnswer, papers, chosen, onChosen, renewal } = props
  const step = props.step ? <span className="step">{props.step}</span> : null
  const [cantFind, setCantFind] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  // After a photo: null while it is read, then what the check found.
  const [check, setCheck] = useState<{ item: string; paper: Paper; result: PhotoCheck | null } | null>(null)
  const personName = loadAbout()?.name ?? ''

  // A proof paper for the renewal form: write the numbers read on it into the
  // answers the person left blank, like the bank's name. They see them on
  // the next screen, marked "Read from".
  function fillBlanks(item: string, paper: Paper, text: string) {
    const kind = proofKind(item)
    if (!renewal || !kind) return
    const blank = blankFacts(renewal.answers)
    for (const [id, value] of Object.entries(readProof(kind, text))) {
      if (blank.includes(id)) renewal.onAnswer(id, value, paper.name)
    }
  }

  // An earlier photo used again: read it in the background for the blanks.
  function reuse(item: string, paper: Paper) {
    if (!renewal || !proofKind(item) || blankFacts(renewal.answers).length === 0) return
    readText(paper.file, () => {})
      .then(({ text }) => fillBlanks(item, paper, text))
      .catch((error) => console.error(error))
  }

  // A new photo of a paper: save it, put it in the reply, then check it.
  async function photo(file: File | undefined, item: string, replacing: string[]) {
    if (!file) return
    const paper = await addPaper(file, item)
    props.onPapersChanged(await listPapers())
    onChosen([...chosen.filter((id) => !replacing.includes(id)), paper.id])
    onAnswer(item, 'photo')
    setCantFind(false)
    setCheck({ item, paper, result: null })
    window.scrollTo(0, 0)
    try {
      // Tries twice if the first reading doesn't look like the right paper (ocr.ts).
      const { text } = await readPaper(file, (read) => checkPhoto(item, read, personName, todayOnThisPhone()).ok)
      fillBlanks(item, paper, text)
      setCheck({ item, paper, result: checkPhoto(item, text, personName, todayOnThisPhone()) })
    } catch (error) {
      // It could not be read, so it can't be checked. The photo still goes in.
      console.error(error)
      setCheck(null)
    }
  }

  const cameraInput = (onFile: (file: File | undefined) => void) => (
    <input
      type="file"
      accept="image/*"
      capture="environment"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        onFile(file)
      }}
    />
  )

  // 1. A request for papers: which boxes are checked?
  if (items === null) {
    return (
      <>
        {step}
        <h1 className="page-title">{t('Which boxes are checked?')}</h1>
        <p className="lead">
          {t('Turn to page 2 of your letter. The county put a check mark next to each thing they need. Tap the same ones here.')}
        </p>
        {MC355_BOXES.map((box) => {
          const on = picked.includes(box)
          return (
            <button key={box} className={`choice ${on ? 'on' : ''}`} onClick={() => setPicked(on ? picked.filter((b) => b !== box) : [...picked, box])}>
              <strong>
                {on ? '✓ ' : ''}
                {t(box)}
              </strong>
            </button>
          )
        })}
        <button className="button primary" disabled={picked.length === 0} onClick={() => props.onItems(picked)}>
          {picked.length === 0
            ? t('Tap the checked boxes first')
            : picked.length === 1
              ? t('Next: 1 paper')
              : t('Next: {n} papers', { n: picked.length })}
        </button>
        <p className="hint">{t("Can't find the boxes, or something else is checked? Call your worker and ask what they need.")}</p>
      </>
    )
  }

  // 2. The renewal form's questions, until they are done.
  if (renewal && renewal.step !== 'done') {
    return <RenewalQuestions renewal={renewal} personName={personName} stopLetter={letterType === 'MC_239A'} />
  }

  // 3. A photo was just taken: what the check found.
  if (check) {
    const { result } = check
    if (!result) {
      return (
        <>
          <h1 className="page-title">{t('Checking your photo…')}</h1>
          <p className="lead" role="status">
            {t("We're reading it to make sure it's the right paper. This takes a few seconds.")}
          </p>
        </>
      )
    }
    return (
      <>
        <h1 className="page-title">{t(check.item)}</h1>
        {result.ok ? (
          <p className="all-good" role="status">
            {t('✓ This looks like {what}, with your name on it.', { what: result.found })}
          </p>
        ) : (
          <div className="card warning" role="alert">
            <h2>{t('Please check this photo')}</h2>
            {result.problems.map((problem) => (
              <p key={problem}>{problem}</p>
            ))}
          </div>
        )}
        <div className="thumbs">
          <Thumb paper={check.paper} />
        </div>
        {result.ok ? (
          <button className="button primary big" onClick={() => setCheck(null)}>
            {t('Next')}
          </button>
        ) : (
          <>
            <label className="button primary big">
              {t('Take it again')}
              {cameraInput((file) => photo(file, check.item, [check.paper.id]))}
            </label>
            <PhotoTip />
            <button className="button" onClick={() => setCheck(null)}>
              {t('Use it anyway')}
            </button>
          </>
        )}
      </>
    )
  }

  // 4. One paper at a time.
  const index = items.findIndex((item) => !answers[item])
  if (index >= 0) {
    const item = items[index]
    const help = helpFor(item)
    const earlier = papers
      .filter((p) => p.name === item)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))[0]
    const answer = (value: PaperAnswer) => {
      setCantFind(false)
      onAnswer(item, value)
      window.scrollTo(0, 0)
    }

    return (
      <>
        <span className="step">{t('Paper {n} of {total}', { n: index + 1, total: items.length })}</span>
        <h1 className="page-title">{t(item)}</h1>
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

        {earlier && (
          <button
            className="button primary big"
            onClick={() => {
              if (!chosen.includes(earlier.id)) onChosen([...chosen, earlier.id])
              answer('photo')
              reuse(item, earlier)
            }}
          >
            {t('Use the photo from {date}', { date: savedOn(earlier.addedAt) })}
          </button>
        )}
        <label className={`button ${earlier ? '' : 'primary big'}`}>
          {earlier ? t('Take a new photo') : t('Take a photo of it')}
          {cameraInput((file) => photo(file, item, earlier ? [earlier.id] : []))}
        </label>
        {!earlier && <PhotoTip />}
        <button className="button" onClick={() => answer('mail')}>
          {t("I'll put the paper copy in the envelope")}
        </button>
        {help.noneLabel && props.canSayNone(item) && (
          <button className="button" onClick={() => answer('none')}>
            {t(help.noneLabel)}
          </button>
        )}
        {!cantFind ? (
          <button className="link" onClick={() => setCantFind(true)}>
            {t("I can't find it right now")}
          </button>
        ) : (
          <div className="card">
            <p>{t("That's okay. You can send everything else now, and send this one when you find it.")}</p>
            <p>{t('You can also call your worker. They can sometimes look it up for you.')}</p>
            <button className="button" onClick={() => answer('later')}>
              {t('Skip it for now')}
            </button>
          </div>
        )}
        {index > 0 ? (
          <button className="link" onClick={() => onAnswer(items[index - 1], null)}>
            {t('Back to the last paper')}
          </button>
        ) : (
          renewal && (
            <button className="link" onClick={() => renewal.onStep('review')}>
              {t('Back to my answers')}
            </button>
          )
        )}
      </>
    )
  }

  // 5. Every paper has an answer: show them all, with a way to change each.
  return (
    <>
      {step}
      <h1 className="page-title">{t('Here are your papers')}</h1>
      <ul className="paper-list">
        {renewal && (
          <li className="paper-row done">
            <p className="paper-row-name">{t(RENEWAL_FORM.replace(', filled in and signed', ''))}</p>
            <p className="small">{t("✓ We filled it in from your answers. You'll sign it at the end.")}</p>
            <ul className="small renewal-lines">
              {renewalLines(renewal.answers).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button className="link" onClick={() => renewal.onStep('review')}>
              {t('Check or change my answers')}
            </button>
          </li>
        )}
        {items.map((item) => (
          <li key={item} className={`paper-row ${answers[item] === 'photo' ? 'done' : ''}`}>
            <p className="paper-row-name">{t(item)}</p>
            <p className="small">{t(ANSWER_WORDS[answers[item]])}</p>
            <button className="link" onClick={() => onAnswer(item, null)}>
              {t('Change')}
            </button>
          </li>
        ))}
      </ul>
      {props.children}
    </>
  )
}

const ANSWER_WORDS: Record<PaperAnswer, string> = {
  photo: '✓ Photo added',
  mail: "✉ You'll put the paper copy in the envelope",
  none: "You'll sign a statement that you don't have this",
  later: "You'll send this one later",
}

// A small picture of the photo just taken.
function Thumb({ paper }: { paper: Paper }) {
  const [url] = useState(() => URL.createObjectURL(paper.file))
  return (
    <figure className="thumb">
      <img src={url} alt="" />
      <figcaption>{paper.name}</figcaption>
    </figure>
  )
}
