// The letter screen, after the facts are checked. Made for one glance:
//   1. what happened (one sentence)
//   2. the one thing to do, by when, and why it helps
//   3. one big button
// Everything else (the hearing, the explanation, writing down what happened)
// sits below, smaller, for when the person wants it.
import { useEffect, useMemo, useState } from 'react'
import type { SavedLetter } from './storage'
import { todayOnThisPhone } from './deadlines'
import { daysLeftWords, jobFor } from './letterJob'
import { inWords } from './words'
import Explanation from './Explanation'
import Watcher from './Watcher'

export default function LetterHome({ letter, onNewLetter, onAddEvent, onMakeReply, onUseHelper }: {
  letter: SavedLetter
  onNewLetter: () => void
  onAddEvent: () => void
  onMakeReply: (withHearing: boolean) => void
  onUseHelper: () => void
}) {
  const { letterType, facts, mode } = letter
  const job = jobFor(letterType, facts, todayOnThisPhone())
  const online = useOnline()
  // Neil's choice: in AI mode the big button runs the AI helper. It needs the
  // internet, so offline (or in phone-only mode) it opens the manual steps.
  const helper = mode === 'ai' && online
  const [explaining, setExplaining] = useState(false)
  // The same object between screens, so the explanation is not asked for twice.
  const explainFacts = useMemo(() => ({ letter_type: letterType, ...facts }), [letterType, facts])

  return (
    <>
      <Watcher letter={letter} helperOffered={helper} onUseHelper={onUseHelper} onMakeReply={() => onMakeReply(false)} />

      <h1 className="page-title">{job.headline}</h1>
      {job.detail && <p className="lead">{job.detail}</p>}

      <div className="job">
        <p className="job-task">{job.task}</p>
        <p className="job-why">{job.why}</p>
        {daysLeftWords(job.deadline) && <p className="job-days">{daysLeftWords(job.deadline)}</p>}
        {job.deadline && !job.deadline.date && (
          <p className="job-why">We could not find the date on your letter. Look for it near the top.</p>
        )}
      </div>

      <button className="button primary big" onClick={helper ? onUseHelper : () => onMakeReply(false)}>
        {job.button}
      </button>
      {helper && (
        <button className="link" onClick={() => onMakeReply(false)}>
          I would rather do it myself
        </button>
      )}
      {mode === 'ai' && !online && <p className="hint">No internet right now, so you will do the steps yourself.</p>}

      {facts.worker_phone && (
        <p className="hint">
          Questions? Call {facts.worker_name ? `your worker, ${facts.worker_name}, at` : 'your worker at'}{' '}
          <a className="link" href={`tel:${facts.worker_phone.replace(/[^\d]/g, '')}`}>
            {facts.worker_phone}
          </a>
          .
        </p>
      )}

      {job.hearing && (
        <details className="more">
          <summary>Think the county made a mistake?</summary>
          <p>You can ask a judge to look at it. This is called a state hearing.</p>
          {job.hearing.lastDay?.date && <p>Ask by {inWords(job.hearing.lastDay.date)}.</p>}
          {job.hearing.keepsCoverage?.date && job.hearing.keepsCoverage.status !== 'passed' && (
            <p>
              If you ask by {inWords(job.hearing.keepsCoverage.date)}, your Medi-Cal stays on while you wait.
            </p>
          )}
          <button className="button" onClick={() => onMakeReply(true)}>
            Ask for a hearing
          </button>
        </details>
      )}

      {mode === 'ai' && (
        <details className="more" onToggle={(e) => setExplaining((e.target as HTMLDetailsElement).open)}>
          <summary>What does this letter mean?</summary>
          {explaining && <Explanation facts={explainFacts} />}
        </details>
      )}

      <details className="more">
        <summary>Did something happen?</summary>
        <p>If you sent papers, or the county did something, write it down. We check it for mistakes by the county.</p>
        <button className="button" onClick={onAddEvent}>
          Write down what happened
        </button>
      </details>

      <button className="link quiet-link" onClick={onNewLetter}>
        Read a different letter
      </button>
    </>
  )
}

// True while the phone has internet.
function useOnline(): boolean {
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
  return online
}
