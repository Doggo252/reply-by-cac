// What the reply will look like, for "Look over your reply". Both ways of
// making a reply (step by step, and the AI helper) show this same preview.
import { useEffect, useState } from 'react'
import { coverLetter, type CoverLetterInput } from './packet'
import type { Paper } from './storage'
import { inWords } from './words'

// Page 1: the cover letter, word for word as it will be printed.
export function CoverPreview(props: CoverLetterInput) {
  const letter = coverLetter(props)
  const lines = (items: string[]) => items.map((line, i) => <span key={i}>{line}<br /></span>)
  return (
    <div className="card preview">
      <p className="preview-label">Page 1: your letter to the county</p>
      <div className="letter">
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
          <span className="letter-sign">(your signature)</span>
          <br />
          {letter.name}
        </p>
      </div>
    </div>
  )
}

// The photos going in the reply. With onRemove, each one can be taken out.
export function PhotoPreview({ photos, onRemove }: { photos: Paper[]; onRemove?: (id: string) => void }) {
  if (photos.length === 0) {
    return <p className="hint">No photos are in your reply. Remember to put the paper copies in the envelope.</p>
  }
  return (
    <div className="card preview">
      <p className="preview-label">Then your photos</p>
      <div className="thumbs">
        {photos.map((p) => (
          <div key={p.id}>
            <PaperThumb paper={p} />
            {onRemove && (
              <button className="link" onClick={() => onRemove(p.id)}>
                Take it out
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
      <figcaption>{paper.name}</figcaption>
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
