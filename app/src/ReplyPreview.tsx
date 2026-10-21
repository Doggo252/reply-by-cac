// What the reply will look like, for "Look over your reply". Both ways of
// making a reply (step by step, and the AI helper) show this same preview.
import { useEffect, useState } from 'react'
import { coverLetter, type CoverLetterInput } from './packet'
import { FROM_PAPER_NAMES, money, renewalLines, type RenewalAnswers } from './renewalForm'
import type { Paper } from './storage'
import { inWords } from './words'
import { getLanguage, t } from './language'

// Page 1: the cover letter, word for word as it will be printed.
export function CoverPreview(props: CoverLetterInput) {
  const letter = coverLetter(props)
  const lines = (items: string[]) => items.map((line, i) => <span key={i}>{line}<br /></span>)
  return (
    <div className="card preview">
      <p className="preview-label">{t('Page 1: your letter to the county')}</p>
      {getLanguage() !== 'en' && <p className="small">{t('Your letter is in English, because the county reads English.')}</p>}
      <div className="letter" lang="en">
        <p>{lines(letter.from)}</p>
        <p>{letter.date}</p>
        <p>{lines(letter.to)}</p>
        <p><strong>{letter.re}</strong></p>
        <p>{letter.greeting}</p>
        {letter.paragraphs.map((text) => <p key={text}>{text}</p>)}
        {letter.list.length > 0 && (
          <>
            <p>I am including:</p>
            <ul>
              {letter.list.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </>
        )}
        {letter.after.map((text) => <p key={text}>{text}</p>)}
        <p>
          {letter.closing}
          <br />
          <span className="letter-sign">{t('(your signature)')}</span>
          <br />
          {letter.name}
        </p>
      </div>
    </div>
  )
}

// The renewal form the app filled in: what it will say.
export function RenewalPreview({ answers, fromPapers, onChange }: {
  answers: RenewalAnswers
  fromPapers: Record<string, string> // question -> the paper it was read from
  onChange?: () => void
}) {
  // Answers read off a photo, by the phone or the AI helper. Shown on their
  // own, so the person checks each one against the paper.
  const read = Object.entries(fromPapers).filter(([id]) => answers[id])
  return (
    <div className="card preview">
      <p className="preview-label">{t('Then your renewal form (MC 210 RV), filled in')}</p>
      {read.length > 0 && (
        <div className="read-from-papers">
          <p>
            <strong>{t('We read these from your papers. Please check them:')}</strong>
          </p>
          <ul>
            {read.map(([id, paper]) => (
              <li key={id}>
                {t(FROM_PAPER_NAMES[id] ?? id)}: <strong>{id.endsWith('_name') || id === 'medicare_number' ? answers[id] : `$${money(answers[id])}`}</strong>{' '}
                <span className="small">{t('(from {paper})', { paper: t(paper).replace(/^./, (c) => c.toLowerCase()) })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* The read answers show up again here, so say this is the whole form. */}
      {read.length > 0 && (
        <p>
          <strong>{t('Everything we wrote on the form:')}</strong>
        </p>
      )}
      <ul className="renewal-lines">
        {renewalLines(answers).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="small">{t("You sign it on page 17. That's the signature you make next.")}</p>
      {onChange && (
        <button className="link" onClick={onChange}>
          {t('Change my answers')}
        </button>
      )}
    </div>
  )
}

// The signed statement for papers the person does not have.
export function StatementPreview({ statements }: { statements: string[] }) {
  return (
    <div className="card preview">
      <p className="preview-label">{t('Then your signed statement')}</p>
      <p lang="en">About the papers you asked for:</p>
      <ul className="send-list">
        {statements.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p lang="en">I declare that this is true and correct.</p>
    </div>
  )
}

// The photos going in the reply. With onRemove, each one can be taken out.
export function PhotoPreview({ photos, onRemove }: { photos: Paper[]; onRemove?: (id: string) => void }) {
  if (photos.length === 0) {
    return <p className="hint">{t('No photos are in your reply. Remember to put the paper copies in the envelope.')}</p>
  }
  return (
    <div className="card preview">
      <p className="preview-label">{t('Then your photos')}</p>
      <div className="thumbs">
        {photos.map((p) => (
          <div key={p.id}>
            <PaperThumb paper={p} />
            {onRemove && (
              <button className="link" onClick={() => onRemove(p.id)}>
                {t('Take it out')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// A small picture of a saved paper.
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
      <figcaption>{t(paper.name)}</figcaption>
    </figure>
  )
}

// What the letter says, written for people: dates in words. The forms write
// dates as 08/28/2026, the letter facts as 2026-08-28.
export function letterValue(field: string, value: string): string {
  if (!field.endsWith('_date')) return value
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  const iso = us ? `${us[3]}-${us[1]}-${us[2]}` : value
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? inWords(iso, false) : value
}
