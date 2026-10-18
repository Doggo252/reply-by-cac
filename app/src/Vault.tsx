// "My papers": the receipt vault. Photos and files saved on this phone, each
// with a fingerprint (its SHA-256 hash) taken the moment it was saved. If the
// file were ever changed, its fingerprint would no longer match.
import { useEffect, useState } from 'react'
import { addPaper, listPapers, loadHelperLog, removePaper, saveHelperLog, type Paper } from './storage'
import { fingerprint, shortPrint } from './fingerprint'
import { savedOn } from './words'

export default function Vault({ onShowResults }: { onShowResults: () => void }) {
  const [papers, setPapers] = useState<Paper[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [helperLog, setHelperLog] = useState<string[] | null>(loadHelperLog)

  async function refresh() {
    try {
      setPapers(await listPapers())
    } catch (error) {
      console.error(error)
      setProblem('This phone is not letting the app save. Private browsing can cause this.')
      setPapers([])
    }
  }
  useEffect(() => {
    refresh()
  }, [])

  async function add(input: React.ChangeEvent<HTMLInputElement>) {
    const file = input.target.files?.[0]
    input.target.value = ''
    if (!file) return
    setSaving(true)
    setProblem(null)
    try {
      const name = file.name && !/^image\.\w+$/i.test(file.name) ? file.name : `Photo, ${savedOn(new Date().toISOString())}`
      await addPaper(file, name)
      await refresh()
    } catch (error) {
      console.error(error)
      setProblem('We could not save that file. Please try again.')
    }
    setSaving(false)
  }

  async function remove(paper: Paper) {
    if (!window.confirm(`Remove "${paper.name}" from this phone? This cannot be undone.`)) return
    await removePaper(paper.id)
    refresh()
  }

  return (
    <>
      <h1 className="page-title">My papers</h1>
      <p className="lead">
        Keep photos of receipts, mail slips, and anything you send. They stay on this phone.
      </p>
      {problem && <p className="error">{problem}</p>}

      <label className="button primary">
        {saving ? 'Saving…' : 'Take a photo'}
        <input type="file" accept="image/*" capture="environment" onChange={add} hidden disabled={saving} />
      </label>
      <label className="button">
        Choose a photo or PDF
        <input type="file" accept="image/*,application/pdf" onChange={add} hidden disabled={saving} />
      </label>

      {papers && papers.length === 0 && <p className="hint">No papers saved yet.</p>}
      {papers?.map((paper) => (
        <PaperCard key={paper.id} paper={paper} onRemove={() => remove(paper)} />
      ))}

      {papers && papers.length > 0 && (
        <p className="hint">
          The fingerprint is a code made from the file itself. If anyone changed the file, the code would change too.
        </p>
      )}

      {helperLog && helperLog.length > 0 && (
        <div className="card">
          <h2>What the AI helper did last time</h2>
          <p className="small">One line per step: time, step, IDs, result, why, version. No private words.</p>
          <ol className="action-log">
            {helperLog.map((line, i) => (
              <li key={i} className="log-record">{line}</li>
            ))}
          </ol>
          <button
            className="link danger"
            onClick={() => {
              if (!window.confirm('Delete the AI helper log?')) return
              saveHelperLog(null)
              setHelperLog(null)
            }}
          >
            Delete this log
          </button>
        </div>
      )}

      <button className="button" onClick={onShowResults}>
        How well ReplyBy works
      </button>
    </>
  )
}

function PaperCard({ paper, onRemove }: { paper: Paper; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  // null while checking, then true or false.
  const [unchanged, setUnchanged] = useState<boolean | null>(null)

  useEffect(() => {
    const address = URL.createObjectURL(paper.file)
    setUrl(address)
    // Check the file still matches the fingerprint saved when it was added.
    fingerprint(paper.file).then((now) => setUnchanged(now === paper.sha256))
    return () => URL.revokeObjectURL(address)
  }, [paper])

  const isImage = paper.type.startsWith('image/')
  return (
    <div className="card paper">
      <div className="paper-thumb">{isImage && url ? <img src={url} alt="" /> : 'PDF'}</div>
      <div>
        <p className="paper-name">{paper.name}</p>
        <p className="small">Saved {savedOn(paper.addedAt)}</p>
        <p className="small">
          Fingerprint <span className="fingerprint">{shortPrint(paper.sha256)}</span>
        </p>
        {unchanged === true && <p className="proof">Not changed since it was saved</p>}
        {unchanged === false && <p className="error">This file does not match its fingerprint.</p>}
        <div className="event-bottom">
          {url && (
            <a className="link" href={url} target="_blank" rel="noreferrer">
              Open
            </a>
          )}
          <button className="link danger" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
