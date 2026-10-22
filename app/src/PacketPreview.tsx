// "See the whole packet": every page of the reply, before the person signs.
// Mom asked for this after her Oct 21 test: she wanted to see the filled-in
// form itself, not just a summary. The pages come from the same code that
// makes the real packet (packet.ts), only without the signature yet.
import { useState } from 'react'
import { drawPages } from './pdfPages'
import { t } from './language'

export default function PacketPreview({ make }: { make: () => Promise<Uint8Array> }) {
  const [open, setOpen] = useState(false)
  const [pages, setPages] = useState<string[] | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [failed, setFailed] = useState(false)

  async function show() {
    setOpen(true)
    setPages(null)
    setFailed(false)
    setProgress(null)
    try {
      setPages(await drawPages(await make(), (done, total) => setProgress({ done, total })))
    } catch (error) {
      console.error(error)
      setFailed(true)
    }
  }

  function close() {
    setOpen(false)
    setPages(null)
  }

  if (!open) {
    return (
      <button className="button whole-packet" onClick={show}>
        <PagesIcon />
        {t('See the whole packet, page by page')}
      </button>
    )
  }

  return (
    <div className="card packet-pages">
      <div className="packet-pages-top">
        <h2>{t('Your whole packet')}</h2>
        <button className="link" onClick={close}>
          {t('Close')}
        </button>
      </div>
      <p className="small">
        {t("This is exactly what you'll print. Your signature goes in after you sign.")} {t('To zoom in, spread two fingers on a page.')}
      </p>
      {!pages && !failed && (
        <p className="hint" role="status">
          {progress ? t('Getting page {n} of {total} ready…', { n: progress.done, total: progress.total }) : t('Putting the pages together…')}
        </p>
      )}
      {failed && <p className="error">{t("We couldn't show the pages. Your reply is still fine; you can sign it and look at it after.")}</p>}
      {pages?.map((picture, i) => (
        <figure key={i} className="packet-page">
          <img src={picture} alt={t('Page {n} of {total}', { n: i + 1, total: pages.length })} />
          <figcaption>{t('Page {n} of {total}', { n: i + 1, total: pages.length })}</figcaption>
        </figure>
      ))}
      {pages && (
        <button className="button" onClick={close}>
          {t('Close the pages')}
        </button>
      )}
    </div>
  )
}

const PagesIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="7" y="3" width="13" height="16" rx="2" />
    <path d="M4 7v12a2 2 0 0 0 2 2h10" strokeLinecap="round" />
  </svg>
)
