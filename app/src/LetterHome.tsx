// The letter screen, after the facts are checked. Made for one glance:
//   1. what happened, in one sentence
//   2. the papers to send, as a list
//   3. by when, and why it helps
//   4. one big button
// Everything else (the hearing, the explanation, writing down what happened)
// sits below, folded away, for when the person wants it.
import { useEffect, useMemo, useState } from 'react'
import type { SavedLetter } from './storage'
import { todayOnThisPhone } from './deadlines'
import { daysLeftWords, jobFor, timing } from './letterJob'
import { findCountyPhone, findWorkerFax } from './localFacts'
import { inWords } from './words'
import { addToCalendar, deadlineEvent } from './calendar'
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
  const when = timing(job.deadline)
  const late = job.deadline?.status === 'passed'
  // Read from the letter itself, on the phone.
  const countyPhone = letter.text ? findCountyPhone(letter.text) : null
  const fax = letter.text && letterType === 'MC355' ? findWorkerFax(letter.text) : null
  const online = useOnline()
  // Neil's choice: in AI mode the big button runs the AI helper. It needs the
  // internet, so offline (or in phone-only mode) it opens the steps instead.
  const helper = mode === 'ai' && online
  const [explaining, setExplaining] = useState(false)
  // The same object between screens, so the explanation is not asked for twice.
  const explainFacts = useMemo(() => ({ letter_type: letterType, ...facts }), [letterType, facts])
  const [reminded, setReminded] = useState(false)

  // A calendar event on the day to get it there: the deadline, or the Friday
  // before when the deadline is on a weekend.
  function remindMe() {
    const date = when.weekendFriday ?? job.deadline!.date!
    const details = [
      'The county needs:',
      ...job.toSend.map((item) => `- ${item}`),
      ...(when.weekendFriday ? ['', 'The last day on your letter is a weekend, so this is the Friday before.'] : []),
      '',
      'Open ReplyBy for help getting it ready.',
    ].join('\n')
    const title = letterType === 'MC210_RV' ? 'Last day to send your Medi-Cal renewal' : 'Last day to send your Medi-Cal papers'
    addToCalendar(deadlineEvent({ title, date, details, now: new Date() }), 'Medi-Cal reminder.ics')
    setReminded(true)
  }

  return (
    <>
      <Watcher letter={letter} helperOffered={helper} onUseHelper={onUseHelper} onMakeReply={() => onMakeReply(false)} />

      <h1 className="page-title">{job.headline}</h1>

      <div className="card">
        <p className="list-title">{job.listTitle}</p>
        <ul className="send-list">
          {job.toSend.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className={`job ${late ? 'late' : ''}`}>
        <p className="job-task">{job.task}</p>
        <p className="job-why">{job.why}</p>
        {daysLeftWords(job.deadline) && (
          <p className={`job-days ${(job.deadline?.daysLeft ?? 99) <= 14 ? 'soon' : ''}`}>{daysLeftWords(job.deadline)}</p>
        )}
        {job.deadline && !job.deadline.date && (
          <p className="job-why">We couldn't find the date on your letter. It's usually near the top.</p>
        )}
        {when.weekendFriday && (
          <p className="job-tip">
            That day is a weekend, when county offices are closed. Get it to them by {inWords(when.weekendFriday)}.
          </p>
        )}
        {when.soon && (
          <p className="job-tip">
            That's soon. Mail can take a week, so fax it or take it to your county office
            {letterType === 'MC210_RV' && countyPhone ? ', or renew by phone' : ''}.
          </p>
        )}
        {job.deadline?.date && !late && (
          <>
            <button className="link" onClick={remindMe}>
              Remind me on my calendar
            </button>
            {reminded && (
              <p className="small">
                Open the file your phone saved, then tap Add. Your calendar will remind you a week before, and the day
                before.
              </p>
            )}
          </>
        )}
      </div>

      {late && facts.worker_phone && (
        <a className="button primary big" href={`tel:${facts.worker_phone.replace(/[^\d]/g, '')}`}>
          Call your worker now
        </a>
      )}

      <button className="button primary big" onClick={helper ? onUseHelper : () => onMakeReply(false)}>
        {job.button}
      </button>
      <p className="hint">
        {letterType === 'MC210_RV'
          ? "We'll show you what to fill in, then make a signed page and a cover sheet for you to mail with it."
          : "You'll take a photo of each paper. We put them together with a cover sheet for you to sign and send."}
      </p>
      {helper && (
        <button className="link" onClick={() => onMakeReply(false)}>
          I'd rather do it myself, step by step
        </button>
      )}
      {mode === 'ai' && !online && <p className="hint">You're not online right now, so we'll go step by step.</p>}

      {(letterType === 'MC210_RV' || fax) && (
        <details className="more">
          <summary>{letterType === 'MC210_RV' ? 'Other ways to renew' : 'Other ways to send it'}</summary>
          {letterType === 'MC210_RV' && countyPhone && (
            <p>
              <strong>By phone:</strong> call{' '}
              <a className="link" href={`tel:${countyPhone.replace(/[^\d]/g, '')}`}>
                {countyPhone}
              </a>{' '}
              and answer the questions with them. Have your form in front of you.
            </p>
          )}
          {letterType === 'MC210_RV' && (
            <p>
              <strong>Online:</strong> at BenefitsCal.com, if you have an account.
            </p>
          )}
          {fax && (
            <p>
              <strong>By fax:</strong> your worker's fax number is {fax}. Many pharmacies and libraries can fax for you.
            </p>
          )}
          <p>
            <strong>In person:</strong> take it to your county Medi-Cal office, and ask for a stamped copy.
          </p>
        </details>
      )}

      {facts.worker_phone && !late && (
        <p className="hint">
          Have a question? Call {facts.worker_name ? `your worker, ${facts.worker_name}, at` : 'your worker at'}{' '}
          <a className="link" href={`tel:${facts.worker_phone.replace(/[^\d]/g, '')}`}>
            {facts.worker_phone}
          </a>
          .
        </p>
      )}

      {job.hearing && (
        <details className="more">
          <summary>Think the county got it wrong?</summary>
          <p>You can ask a judge to look at it. This is called a state hearing.</p>
          {job.hearing.lastDay?.date && <p>You have until {inWords(job.hearing.lastDay.date)} to ask.</p>}
          {job.hearing.keepsCoverage?.date && job.hearing.keepsCoverage.status !== 'passed' && (
            <p>If you ask by {inWords(job.hearing.keepsCoverage.date)}, you keep your Medi-Cal while you wait.</p>
          )}
          <button className="button" onClick={() => onMakeReply(true)}>
            Ask for a hearing
          </button>
        </details>
      )}

      {mode === 'ai' && (
        <details className="more" onToggle={(e) => setExplaining((e.target as HTMLDetailsElement).open)}>
          <summary>Explain this letter to me</summary>
          {explaining && <Explanation facts={explainFacts} />}
        </details>
      )}

      <details className="more">
        <summary>Already sent something?</summary>
        <p>Write down what you sent and when. If the county made a mistake, we'll spot it.</p>
        <button className="button" onClick={onAddEvent}>
          Write it down
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
