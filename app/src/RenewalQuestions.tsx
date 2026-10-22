// The renewal form, one question at a time (questions in renewalForm.ts).
//
//   start      what will happen, and what papers help
//   questions  one per screen: Yes/No buttons, a choice, or a box to type in.
//              Where a paper shows the answer, the person can take a photo of
//              it and the phone reads the number for them (proofRead.ts).
//   review     every answer on one screen, each with a Change button
//
// Answers are saved as the person goes (usePapers.ts), so nothing is lost if
// the app closes.
import { useState } from 'react'
import { checkPhoto } from './photoCheck'
import { readProof } from './proofRead'
import { readPaper } from './ocr'
import PhotoTip from './PhotoTip'
import { todayOnThisPhone } from './deadlines'
import {
  LETTER_PAPER,
  PROOF_PAPERS,
  RENEWAL_QUESTIONS,
  money,
  nextQuestion,
  visibleQuestions,
  type Question,
  type RenewalAnswers,
} from './renewalForm'
import { COUNTY_PAGES, ON_FILE, onFileRows, rowWords } from './countyForm'
import { CountyPage, HaveCountyPages } from './CountyPages'
import { addPaper, type Paper } from './storage'
import { inWords } from './words'
import { t } from './language'

export type RenewalProps = {
  answers: RenewalAnswers
  step: string // "start", "review", "done", or a question id
  fromPapers: Record<string, string> // question -> the paper it was read from
  onAnswer: (id: string, value: string | null, fromPaper?: string) => void
  onStep: (step: string) => void
  onPhoto: (paper: Paper, attach: boolean) => void // a proof photo was taken
}

export default function RenewalQuestions({ renewal, personName, stopLetter }: {
  renewal: RenewalProps
  personName: string
  stopLetter: boolean // a stop letter that asks for the renewal form
}) {
  const { answers, step, onStep } = renewal
  const visible = visibleQuestions(answers)
  // The next question after this answer, worked out from the new answers.
  const after = (changed: RenewalAnswers) => nextQuestion(changed)?.id ?? 'review'

  // The pages the county filled in, before the questions (CountyPages.tsx).
  if (step === 'county') {
    return (
      <HaveCountyPages
        onYes={() => onStep(`county-${COUNTY_PAGES[0].section}`)}
        onNo={() => {
          renewal.onAnswer(ON_FILE, '[]')
          onStep(after({ ...answers, [ON_FILE]: '[]' }))
        }}
        onBack={() => onStep('start')}
      />
    )
  }
  const countyIndex = COUNTY_PAGES.findIndex((page) => step === `county-${page.section}`)
  if (countyIndex >= 0) {
    const next = COUNTY_PAGES[countyIndex + 1]
    return (
      <CountyPage
        key={step}
        index={countyIndex}
        renewal={renewal}
        onNext={(changed) => onStep(next ? `county-${next.section}` : after(changed))}
        onBack={() => onStep(countyIndex > 0 ? `county-${COUNTY_PAGES[countyIndex - 1].section}` : 'county')}
      />
    )
  }

  if (step === 'start') {
    // Answers read from the letter (the date of birth) don't count as started.
    const resuming = Object.keys(answers).some((id) => renewal.fromPapers[id] !== LETTER_PAPER)
    return (
      <>
        <h1 className="page-title">{t("We'll fill in your renewal form for you")}</h1>
        {stopLetter && <p className="lead">{t('Your letter says the county never got your renewal form.')}</p>}
        <p className="lead">
          {t("We'll ask you some questions, one at a time, and write your answers on the official renewal form (MC 210 RV). You don't need the paper form.")}
        </p>
        <div className="card">
          <h2>{t('It helps to have these nearby')}</h2>
          <ul className="send-list">
            <li>{t('Your Social Security letter')}</li>
            <li>{t('Your newest bank statement')}</li>
            <li>{t('Your Medicare card')}</li>
          </ul>
          <p className="small">{t("You can take a photo of each one, and we'll read the numbers for you.")}</p>
        </div>
        <button className="button primary big" onClick={() => onStep(resuming || ON_FILE in answers ? after(answers) : 'county')}>
          {resuming ? t('Pick up where I left off') : t('Start')}
        </button>
      </>
    )
  }

  const question = RENEWAL_QUESTIONS.find((q) => q.id === step)
  const onFile = onFileRows(answers)
  if (step === 'review' || !question) {
    return (
      <>
        <h1 className="page-title">{t("Here's what we'll write on your form")}</h1>
        <p className="lead">{t('Check each answer. Tap Change to fix one.')}</p>
        {onFile.length > 0 && (
          <>
            <h2 className="section-title">{t('What the county had on file')}</h2>
            <ul className="paper-list">
              {onFile.map((row, i) => (
                <li key={i} className="paper-row">
                  <p className="paper-row-name">{rowWords(row)}</p>
                  <p className="small">{row.correct ? t('✓ Still right') : t('It changed')}</p>
                  <button className="link" onClick={() => onStep(`county-${row.section}`)}>
                    {t('Change')}
                  </button>
                </li>
              ))}
            </ul>
            <h2 className="section-title">{t('Your answers')}</h2>
          </>
        )}
        <ul className="paper-list">
          {visible.map((q) => (
            <li key={q.id} className="paper-row">
              <p className="small">{t(q.ask)}</p>
              <p className="paper-row-name">{shown(q, answers[q.id])}</p>
              {renewal.fromPapers[q.id] && <p className="small">{t('Read from: {paper}', { paper: t(renewal.fromPapers[q.id]) })}</p>}
              <button className="link" onClick={() => onStep(q.id)}>
                {t('Change')}
              </button>
            </li>
          ))}
        </ul>
        <button className="button primary big" onClick={() => onStep('done')}>
          {t('It all looks right')}
        </button>
      </>
    )
  }

  const index = visible.findIndex((q) => q.id === question.id)
  const back = () => onStep(index > 0 ? visible[index - 1].id : 'start')
  return (
    <QuestionScreen
      key={question.id}
      question={question}
      number={index + 1}
      renewal={renewal}
      personName={personName}
      onDone={(changed) => onStep(after(changed))}
      onBack={back}
    />
  )
}

// How an answer reads on the review screen.
function shown(q: Question, value: string | undefined): string {
  if (value === undefined) return t('Not answered yet')
  if (value === '') return t("You didn't know. You can write it on the form later.")
  if (q.kind === 'yesno') return value === 'yes' ? t('Yes') : t('No')
  if (q.kind === 'money') return `$${money(value)}`
  if (q.kind === 'date') return inWords(value, false)
  if (q.kind === 'choice') return value.split(', ').map((choice) => t(choice)).join(', ')
  return value
}

function QuestionScreen({ question: q, number, renewal, personName, onDone, onBack }: {
  question: Question
  number: number
  renewal: RenewalProps
  personName: string
  onDone: (changed: RenewalAnswers) => void
  onBack: () => void
}) {
  const { answers, onAnswer } = renewal
  const [value, setValue] = useState(answers[q.id] ?? '')
  const [reading, setReading] = useState(false)
  // What the photo told us: problems with it, and whether it had this answer.
  const [photo, setPhoto] = useState<{ problems: string[]; foundThis: boolean } | null>(null)

  function answer(given: string) {
    onAnswer(q.id, given, given && renewal.fromPapers[q.id] && given === answers[q.id] ? renewal.fromPapers[q.id] : undefined)
    onDone({ ...answers, [q.id]: given })
  }

  // A photo of the paper that shows the answer: read it on the phone.
  async function readPhoto(file: File | undefined) {
    if (!file || !q.proof) return
    setReading(true)
    setPhoto(null)
    const paperName = PROOF_PAPERS[q.proof]
    const paper = await addPaper(file, paperName)
    // The Medicare card is only read, never sent: its number goes on the form.
    renewal.onPhoto(paper, q.proof !== 'medicare_card')
    try {
      // Tries twice if the first reading misses the answer (ocr.ts).
      const kind = q.proof
      const { text } = await readPaper(file, (read) => !!readProof(kind, read)[q.id])
      const found = readProof(q.proof, text)
      for (const [id, read] of Object.entries(found)) onAnswer(id, read, paperName)
      if (found[q.id]) setValue(found[q.id])
      setPhoto({ problems: checkPhoto(paperName, text, personName, todayOnThisPhone()).problems, foundThis: !!found[q.id] })
    } catch (error) {
      console.error(error)
      setPhoto({ problems: [t("We couldn't read this photo. Please type it in.")], foundThis: false })
    }
    setReading(false)
  }

  return (
    <>
      {/* No "of 25": the total grows as follow-up questions appear, which is confusing. */}
      <span className="step">{t('Question {n}', { n: number })}</span>
      <h1 className="page-title">{t(q.ask)}</h1>
      {q.help && <p className="lead">{t(q.help)}</p>}

      {q.kind === 'yesno' && (
        <div className="button-row">
          <button className={`button big ${answers[q.id] === 'yes' ? 'primary' : ''}`} onClick={() => answer('yes')}>
            {t('Yes')}
          </button>
          <button className={`button big ${answers[q.id] === 'no' ? 'primary' : ''}`} onClick={() => answer('no')}>
            {t('No')}
          </button>
        </div>
      )}

      {q.kind === 'choice' && !q.many && (
        <>
          {q.choices!.map((choice) => (
            <button key={choice} className={`choice ${answers[q.id] === choice ? 'on' : ''}`} onClick={() => answer(choice)}>
              <strong>{t(choice)}</strong>
            </button>
          ))}
        </>
      )}

      {q.kind === 'choice' && q.many && (
        <>
          {q.choices!.map((choice) => {
            const picked = value.split(', ').filter(Boolean)
            const on = picked.includes(choice)
            return (
              <button
                key={choice}
                className={`choice ${on ? 'on' : ''}`}
                onClick={() => setValue((on ? picked.filter((c) => c !== choice) : [...picked, choice]).join(', '))}
              >
                <strong>
                  {on ? '✓ ' : ''}
                  {t(choice)}
                </strong>
              </button>
            )
          })}
          <button className="button primary" disabled={!value} onClick={() => answer(value)}>
            {t('Next')}
          </button>
        </>
      )}

      {(q.kind === 'text' || q.kind === 'money' || q.kind === 'date') && (
        <>
          {reading && (
            <p className="hint" role="status">
              {t('Reading your photo… This takes a few seconds.')}
            </p>
          )}
          {photo && (
            <div className={photo.foundThis && photo.problems.length === 0 ? 'all-good' : 'card'}>
              {photo.foundThis ? (
                <p>{t("✓ We read this from your photo. Please check it's right.")}</p>
              ) : (
                <p>{t("We couldn't find it on the photo. You can type it in, or try another photo.")}</p>
              )}
              {photo.problems.map((problem) => (
                <p key={problem} className="small">
                  {problem}
                </p>
              ))}
            </div>
          )}
          <label className="field">
            <span>{q.kind === 'money' ? t('Amount in dollars') : q.kind === 'date' ? t('Date') : t('Your answer')}</span>
            <input
              type={q.kind === 'date' ? 'date' : 'text'}
              inputMode={q.kind === 'money' ? 'decimal' : undefined}
              placeholder={q.placeholder ? t(q.placeholder) : q.kind === 'money' ? t('Like: 1,240.00') : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          {renewal.fromPapers[q.id] && value === answers[q.id] && <p className="small">{t('Read from: {paper}', { paper: t(renewal.fromPapers[q.id]) })}</p>}
          <button className="button primary big" disabled={!value.trim()} onClick={() => answer(value.trim())}>
            {t('Next')}
          </button>
          {q.proof && (
            <label className="button">
              {photo ? t('Try another photo') : t('Take a photo of {paper}', { paper: t(PROOF_PAPERS[q.proof]).replace(/^./, (c) => c.toLowerCase()) })}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  readPhoto(file)
                }}
              />
            </label>
          )}
          {q.proof && !photo && <PhotoTip />}
          <button className="link" onClick={() => answer('')}>
            {t("I don't know")}
          </button>
        </>
      )}

      <button className="link" onClick={onBack}>
        {t('Back')}
      </button>
    </>
  )
}
