// The papers to send, one line each, with a photo button on every line.
// A photo is saved under the paper's own name ("Proof of income"), so the
// person can see at a glance which ones are done.
import { useEffect } from 'react'
import { addPaper, listPapers, type Paper } from './storage'
import { savedOn } from './words'

export default function PaperChecklist({ items, papers, chosen, onChange, onPapersChanged }: {
  items: string[] // what the county asked for (whatToSend in letterJob.ts)
  papers: Paper[] // everything saved in My papers
  chosen: string[] // the paper IDs going in the reply
  onChange: (chosen: string[]) => void
  onPapersChanged: (papers: Paper[]) => void
}) {
  const own = papers.filter((p) => !p.name.startsWith('Reply packet'))
  // The newest photo saved under each paper's name.
  const photoFor = (item: string) =>
    own.filter((p) => p.name === item).sort((a, b) => b.addedAt.localeCompare(a.addedAt))[0]

  // A photo already saved for one of these papers goes in the reply on its own.
  useEffect(() => {
    const ready = items.map(photoFor).filter((p): p is Paper => !!p && !chosen.includes(p.id))
    if (ready.length > 0) onChange([...chosen, ...ready.map((p) => p.id)])
  }, [papers])

  async function takePhoto(file: File | undefined, name: string, replacing?: Paper) {
    if (!file) return
    const paper = await addPaper(file, name)
    onPapersChanged(await listPapers())
    onChange([...chosen.filter((id) => id !== replacing?.id), paper.id])
  }

  const extras = own.filter((p) => !items.includes(p.name))

  return (
    <>
      <ul className="paper-list">
        {items.map((item) => {
          const photo = photoFor(item)
          const done = photo && chosen.includes(photo.id)
          return (
            <li key={item} className={`paper-row ${done ? 'done' : ''}`}>
              <p className="paper-row-name">
                {done ? '✓ ' : ''}
                {item}
              </p>
              <label className={done ? 'link' : 'button'}>
                {done ? 'Take the photo again' : 'Take a photo of it'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    takePhoto(file, item, photo)
                  }}
                />
              </label>
            </li>
          )
        })}
      </ul>

      {extras.length > 0 && (
        <>
          <p className="hint">Other papers on your phone. Tap one to send it too.</p>
          {extras.map((p) => {
            const on = chosen.includes(p.id)
            return (
              <button
                key={p.id}
                className={`choice ${on ? 'on' : ''}`}
                onClick={() => onChange(on ? chosen.filter((id) => id !== p.id) : [...chosen, p.id])}
              >
                <strong>{on ? '✓ ' : ''}{p.name}</strong>
                <span>{on ? 'Sending this one' : `Saved ${savedOn(p.addedAt)}`}</span>
              </button>
            )
          })}
        </>
      )}

      <label className="link">
        Add a photo of another paper
        <input
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            takePhoto(file, `Paper, ${savedOn(new Date().toISOString())}`)
          }}
        />
      </label>
    </>
  )
}

// How many of the papers still have no photo.
export function missingPhotos(items: string[], papers: Paper[], chosen: string[]): number {
  return items.filter((item) => !papers.some((p) => p.name === item && chosen.includes(p.id))).length
}
