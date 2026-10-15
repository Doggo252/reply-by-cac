// After the facts are checked: what the letter means and what to do by when.
import { useMemo } from 'react'
import type { SavedLetter } from './storage'
import { inWords, plain } from './words'
import Countdowns from './Countdowns'
import Explanation from './Explanation'

export default function LetterHome({ letter, onNewLetter, onAddEvent, onMakeReply }: {
  letter: SavedLetter
  onNewLetter: () => void
  onAddEvent: () => void
  onMakeReply: () => void
}) {
  const { letterType, facts, mode } = letter
  // Kept the same object between screens, so the explanation is not asked
  // for again (each ask costs money).
  const explainFacts = useMemo(() => ({ letter_type: letterType, ...facts }), [letterType, facts])

  return (
    <>
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

      <button className="button primary" onClick={onMakeReply}>
        Get my reply ready
      </button>
      <p className="hint">We fill in the forms, check them against your letter, and you sign.</p>

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
