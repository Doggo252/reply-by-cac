// The renewal pages the county filled in (countyForm.ts). First: does the
// person have them? Then, for each page with a "Review" box, a photo, and
// "Is this still right?" for each line the county printed.
import { useState } from 'react'
import { readPaper } from './ocr'
import PhotoTip from './PhotoTip'
import type { RenewalProps } from './RenewalQuestions'
import type { RenewalAnswers } from './renewalForm'
import {
  answersFromRows,
  COUNTY_PAGES,
  COUNTY_PAPER,
  ON_FILE,
  onFileRows,
  readCountyPage,
  rowWords,
  type OnFileRow,
} from './countyForm'
import { t } from './language'

export function HaveCountyPages({ onYes, onNo, onBack }: { onYes: () => void; onNo: () => void; onBack: () => void }) {
  return (
    <>
      <h1 className="page-title">{t('Do you have the pages the county filled in?')}</h1>
      <p className="lead">
        {t(
          "Your renewal packet has pages that say \"Review your information\", with what the county already knows printed in boxes. If you have them, we'll read them, and you just tell us if each line is still right.",
        )}
      </p>
      <button className="button primary big" onClick={onYes}>
        {t('Yes, I have them')}
      </button>
      <button className="button" onClick={onNo}>
        {t('No, I only have the letter')}
      </button>
      <button className="link" onClick={onBack}>
        {t('Back')}
      </button>
    </>
  )
}

export function CountyPage({ index, renewal, onNext, onBack }: {
  index: number // which page in COUNTY_PAGES
  renewal: RenewalProps
  onNext: (changed: RenewalAnswers) => void
  onBack: () => void
}) {
  const page = COUNTY_PAGES[index]
  const { answers, onAnswer } = renewal
  const saved = onFileRows(answers).filter((row) => row.section === page.section)
  // The lines read so far (null: no photo yet), with the person's answers.
  const [rows, setRows] = useState<OnFileRow[] | null>(saved.length ? saved : null)
  const [reading, setReading] = useState(false)
  const [missed, setMissed] = useState(false)

  async function read(file: File | undefined) {
    if (!file) return
    setReading(true)
    setMissed(false)
    try {
      // Tries twice if the first reading finds no lines (ocr.ts).
      const { text } = await readPaper(file, (words) => readCountyPage(words, page.section).length > 0)
      const found = readCountyPage(text, page.section)
      setRows(found.length ? found : null)
      setMissed(found.length === 0)
    } catch (error) {
      console.error(error)
      setMissed(true)
    }
    setReading(false)
  }

  // Saves this page's lines with the others, fills in the answers they give,
  // and goes on.
  function finish(checked: OnFileRow[]) {
    const all = [...onFileRows(answers).filter((row) => row.section !== page.section), ...checked]
    const given = answersFromRows(checked)
    onAnswer(ON_FILE, JSON.stringify(all))
    for (const [id, value] of Object.entries(given)) onAnswer(id, value, COUNTY_PAPER)
    onNext({ ...answers, ...given, [ON_FILE]: JSON.stringify(all) })
  }

  const allAnswered = !!rows && rows.every((row) => row.correct !== undefined)

  return (
    <>
      <span className="step">{t('Page {n} of the renewal form', { n: page.page })}</span>
      <h1 className="page-title">{t(page.title)}</h1>

      {!rows && (
        <>
          {/* The heading stays in English: that is how it is printed on the form. */}
          <p className="lead">{t('Find the page that says "{heading}". Take a photo of it.', { heading: page.heading })}</p>
          {reading && (
            <p className="hint" role="status">
              {t('Reading your photo… This takes a few seconds.')}
            </p>
          )}
          {missed && <p className="notice">{t("We couldn't read the lines on this page. Try another photo, or skip this page and answer the questions instead.")}</p>}
          <label className="button primary big">
            {missed ? t('Try another photo') : t('Take a photo of this page')}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                read(file)
              }}
            />
          </label>
          <PhotoTip />
          <button className="button" onClick={() => finish([])}>
            {t('Nothing is printed in that box')}
          </button>
        </>
      )}

      {rows && (
        <>
          <p className="lead">{t('The county has this on file. Is each line still right?')}</p>
          <p className="small">{t('Check each line against your page. If we read something wrong, tap "It changed" and you can type it.')}</p>
          {rows.map((row, i) => (
            <div key={i} className="card on-file">
              <p className="on-file-line">{rowWords(row)}</p>
              <div className="button-row">
                <button
                  className={`button ${row.correct === true ? 'primary' : ''}`}
                  onClick={() => setRows(rows.map((r, j) => (j === i ? { ...r, correct: true } : r)))}
                >
                  {t('Still right')}
                </button>
                <button
                  className={`button ${row.correct === false ? 'primary' : ''}`}
                  onClick={() => setRows(rows.map((r, j) => (j === i ? { ...r, correct: false } : r)))}
                >
                  {t('It changed')}
                </button>
              </div>
            </div>
          ))}
          <button className="button primary big" disabled={!allAnswered} onClick={() => finish(rows)}>
            {allAnswered ? t('Next') : t('Answer each line first')}
          </button>
          <button className="link" onClick={() => setRows(null)}>
            {t('Take the photo again')}
          </button>
        </>
      )}

      <button className="link" onClick={onBack}>
        {t('Back')}
      </button>
    </>
  )
}
