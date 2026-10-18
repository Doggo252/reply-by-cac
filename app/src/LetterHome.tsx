// After the facts are checked: what the letter means and what to do by when.
import { useEffect, useMemo, useState } from 'react'
import type { SavedLetter } from './storage'
import { inWords, plain } from './words'
import Countdowns from './Countdowns'
import Explanation from './Explanation'
import Watcher from './Watcher'

export default function LetterHome({ letter, onNewLetter, onAddEvent, onMakeReply, onUseHelper }: {
  letter: SavedLetter
  onNewLetter: () => void
  onAddEvent: () => void
  onMakeReply: () => void
  onUseHelper: () => void
}) {
  // TOOLS.md, Section 1: the helper needs the internet, and is never offered
  // in "keep everything on my phone" mode.
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  const { letterType, facts, mode } = letter
  // Kept the same object between screens, so the explanation is not asked
  // for again (each ask costs money).
  const explainFacts = useMemo(() => ({ letter_type: letterType, ...facts }), [letterType, facts])

  return (
    <>
      <Watcher letter={letter} helperOffered={mode === 'ai' && online} onUseHelper={onUseHelper} onMakeReply={onMakeReply} />
      <h1 className="page-title">Your letter</h1>
      <span className="step">Step 3 of 3</span>
      <div className="card">
        <p className="big-answer">{plain(letterType)}</p>
        {facts.notice_date && <p className="small">Dated {inWords(facts.notice_date, false)}</p>}
      </div>

      {mode === 'ai' ? (
        <Explanation facts={explainFacts} />
      ) : (
        <p className="hint">
          Explaining the letter in plain words needs AI help. You chose to keep everything on your phone.
        </p>
      )}

      <Countdowns letterType={letterType} facts={facts} />

      {mode === 'ai' && (
        <>
          <button className="button primary" onClick={onUseHelper} disabled={!online}>
            Use AI to prepare my response
          </button>
          <p className="hint">
            {online
              ? 'The AI picks your papers and writes the drafts. You look everything over and sign.'
              : 'This needs the internet. You can still prepare it yourself below.'}
          </p>
        </>
      )}
      <button className={`button ${mode === 'ai' ? '' : 'primary'}`} onClick={onMakeReply}>
        Manually prepare my response
      </button>
      <p className="hint">You fill in the forms, we check them against your letter, and you sign.</p>

      <h2 className="section-title">Did something happen?</h2>
      <p className="hint">
        If you sent papers, or the county did something, write it down. We check it for mistakes by the county.
      </p>
      <button className="button" onClick={onAddEvent}>
        Write down what happened
      </button>
      <button className="button" onClick={onNewLetter}>
        Read a different letter
      </button>
    </>
  )
}
