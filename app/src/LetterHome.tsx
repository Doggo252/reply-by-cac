// The letter screen, after the facts are checked. Made for one glance, with
// as few things to tap as possible (Mom's test, Oct 20: "too many things to
// click, too many dropdowns"):
//   1. what happened, in one sentence
//   2. the papers to send, as a list
//   3. by when, and why it helps
//   4. one big button
// Everything else is behind one "More help" link, on its own screen, as plain
// choices: other ways to send it, the explanation, the hearing, what you
// already sent, a different letter, and starting over.
import { useEffect, useMemo, useState } from 'react'
import { listEvents, type SavedLetter } from './storage'
import { todayOnThisPhone } from './deadlines'
import { daysLeftWords, jobFor, timing } from './letterJob'
import { needsRenewalForm } from './usePapers'
import { useOnline } from './online'
import { findCountyPhone, findWorkerFax } from './localFacts'
import { inWords } from './words'
import { getLanguage, t } from './language'
import { addToCalendar, deadlineEvent } from './calendar'
import Explanation from './Explanation'
import StartOver from './StartOver'
import Watcher from './Watcher'

// What "More help" is showing: its list of choices, or one of them.
type Help = null | 'menu' | 'ways' | 'explain' | 'hearing'

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
  const [help, setHelp] = useState<Help>(null)
  // The same object between screens, so the explanation is not asked for twice.
  const explainFacts = useMemo(() => ({ letter_type: letterType, ...facts }), [letterType, facts])
  const [reminded, setReminded] = useState(false)
  // The day the person wrote down sending their papers for this letter (on or
  // after the letter's date), so the screen says so instead of asking again.
  const [sentOn, setSentOn] = useState<string | null>(null)
  useEffect(() => {
    listEvents()
      .then((events) => {
        const sent = events.filter((e) => e.type === 'papers_sent' && (!facts.notice_date || e.date >= facts.notice_date))
        setSentOn(sent.map((e) => e.date).sort().pop() ?? null)
      })
      .catch(() => setSentOn(null))
  }, [facts.notice_date])
  const renewal = letterType === 'MC210_RV'
  // A renewal, or a stop letter that asks for the renewal form: the app fills it in.
  const fillsForm = needsRenewalForm(letterType, job.toSend)

  function open(next: Help) {
    setHelp(next)
    window.scrollTo(0, 0)
  }

  // A calendar event on the day to get it there: the deadline, or the Friday
  // before when the deadline is on a weekend.
  function remindMe() {
    const date = when.weekendFriday ?? job.deadline!.date!
    const details = [
      t('The county needs:'),
      ...job.toSend.map((item) => `- ${t(item)}`),
      ...(when.weekendFriday ? ['', t('The last day on your letter is a weekend, so this is the Friday before.')] : []),
      '',
      t('Open ReplyBy for help getting it ready.'),
    ].join('\n')
    const title = renewal ? t('Last day to send your Medi-Cal renewal') : t('Last day to send your Medi-Cal papers')
    addToCalendar(deadlineEvent({ title, date, details, now: new Date() }), 'Medi-Cal reminder.ics')
    setReminded(true)
  }

  // "More help": plain choices, one per line.
  if (help === 'menu') {
    return (
      <>
        <h1 className="page-title">{t('More help')}</h1>
        <button className="choice" onClick={() => open('ways')}>
          <strong>{renewal ? t('Other ways to renew') : t('Other ways to send it')}</strong>
          <span>{renewal ? t('By phone, online, or in person') : t('Online, by fax, or in person')}</span>
        </button>
        {mode === 'ai' && (
          <button className="choice" onClick={() => open('explain')}>
            <strong>{t('Explain this letter to me')}</strong>
            <span>{t('In plain words, in English or Spanish')}</span>
          </button>
        )}
        <button className="choice" onClick={onAddEvent}>
          <strong>{t('I already sent something')}</strong>
          <span>{t("Write down what you sent and when. If the county made a mistake, we'll spot it.")}</span>
        </button>
        {job.hearing && (
          <button className="choice" onClick={() => open('hearing')}>
            <strong>{t('I think the county made a mistake')}</strong>
            <span>{t('Ask a judge to look at it')}</span>
          </button>
        )}
        <button className="choice" onClick={onNewLetter}>
          <strong>{t('Read a different letter')}</strong>
          <span>{t('This one will be cleared')}</span>
        </button>
        <button className="button" onClick={() => open(null)}>
          {t('Back to my letter')}
        </button>
        <div className="settings">
          <StartOver />
        </div>
      </>
    )
  }

  if (help === 'ways') {
    return (
      <>
        <h1 className="page-title">{renewal ? t('Other ways to renew') : t('Other ways to send it')}</h1>
        {renewal && countyPhone && (
          <div className="card">
            <h2>{t('By phone')}</h2>
            <p>{t('Call the county and answer the questions with them. Have your letter in front of you.')}</p>
            <a className="button primary" href={`tel:${countyPhone.replace(/[^\d]/g, '')}`}>
              {t('Call {phone}', { phone: countyPhone })}
            </a>
          </div>
        )}
        <div className="card">
          <h2>{t('Online')}</h2>
          <p>
            {renewal
              ? t("At BenefitsCal.com, the state's website, if you have an account.")
              : t("You can upload your papers at BenefitsCal.com, the state's website, if you have an account.")}
          </p>
          <p className="small">
            <strong>{t('Why use ReplyBy?')} </strong>
            {t("BenefitsCal needs an account, and you fill in its forms yourself. It doesn't read your paper letter, explain it in plain words, check if the county made a mistake, or write letters to the county for you. ReplyBy does, starting from a photo of your letter. You can use both.")}
          </p>
        </div>
        {fax && (
          <div className="card">
            <h2>{t('By fax')}</h2>
            <p>{t("Your worker's fax number is {fax}. Many pharmacies and libraries can fax for you.", { fax })}</p>
          </div>
        )}
        <div className="card">
          <h2>{t('In person')}</h2>
          <p>{t('Take it to your county Medi-Cal office, and ask for a stamped copy.')}</p>
        </div>
        <button className="button" onClick={() => open('menu')}>
          {t('Back')}
        </button>
      </>
    )
  }

  if (help === 'explain') {
    return (
      <>
        <Explanation facts={explainFacts} />
        <button className="button" onClick={() => open('menu')}>
          {t('Back')}
        </button>
      </>
    )
  }

  if (help === 'hearing' && job.hearing) {
    return (
      <>
        <h1 className="page-title">{t('I think the county made a mistake')}</h1>
        <p className="lead">{t('You can ask a judge to look at it. This is called a state hearing.')}</p>
        {job.hearing.lastDay?.date && <p>{t('You have until {date} to ask.', { date: inWords(job.hearing.lastDay.date) })}</p>}
        {job.hearing.keepsCoverage?.date && job.hearing.keepsCoverage.status !== 'passed' && (
          <p>{t('If you ask by {date}, you keep your Medi-Cal while you wait.', { date: inWords(job.hearing.keepsCoverage.date) })}</p>
        )}
        <p className="hint">{t('Sending the papers is still what brings your Medi-Cal back. A hearing is a backup.')}</p>
        <button className="button primary" onClick={() => onMakeReply(true)}>
          {t('Ask for a hearing')}
        </button>
        <button className="button" onClick={() => open('menu')}>
          {t('Back')}
        </button>
      </>
    )
  }

  return (
    <>
      <Watcher letter={letter} helperOffered={helper} onUseHelper={onUseHelper} onMakeReply={() => onMakeReply(false)} />

      <h1 className="page-title">{job.headline}</h1>
      {sentOn && (
        <p className="all-good">
          {t('✓ You sent your papers on {date}. Keep your proof, in case the county asks.', { date: inWords(sentOn, false) })}
        </p>
      )}

      <div className="card">
        <p className="list-title">{job.listTitle}</p>
        <ul className="send-list">
          {job.toSend.map((item) => (
            <li key={item}>{t(item)}</li>
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
          <p className="job-why">{t("We couldn't find the date on your letter. It's usually near the top.")}</p>
        )}
        {when.weekendFriday && (
          <p className="job-tip">
            {t('That day is a weekend, when county offices are closed. Get it to them by {date}.', { date: inWords(when.weekendFriday) })}
          </p>
        )}
        {when.soon && (
          <p className="job-tip">
            {renewal && countyPhone
              ? t("That's soon. Mail can take a week, so fax it, take it to your county office, or renew by phone.")
              : t("That's soon. Mail can take a week, so fax it or take it to your county office.")}
          </p>
        )}
        {job.deadline?.date && !late && (
          <>
            <button className="link" onClick={remindMe}>
              {t('Remind me on my calendar')}
            </button>
            {reminded && (
              <p className="small">
                {t('Open the file your phone saved, then tap Add. Your calendar will remind you a week before, and the day before.')}
              </p>
            )}
          </>
        )}
      </div>

      {late && facts.worker_phone && (
        <a className="button primary big" href={`tel:${facts.worker_phone.replace(/[^\d]/g, '')}`}>
          {t('Call your worker now')}
        </a>
      )}

      <button className={sentOn ? 'button' : 'button primary big'} onClick={helper ? onUseHelper : () => onMakeReply(false)}>
        {sentOn ? t('Make my reply again') : job.button}
      </button>
      {!sentOn && (
        <p className="hint">
          {fillsForm
            ? t("We'll ask you the form's questions one at a time, fill in the form for you, and make a cover letter to mail with it.")
            : t("You'll take a photo of each paper. We put them together with a cover letter for you to sign and send.")}
        </p>
      )}
      {helper && (
        <button className="link" onClick={() => onMakeReply(false)}>
          {t("I'd rather do it myself, step by step")}
        </button>
      )}
      {mode === 'ai' && !online && (
        <p className="notice">{t("You're offline, so the AI can't help right now. We'll go step by step on your phone.")}</p>
      )}

      {facts.worker_phone && !late && (
        <p className="hint">
          {facts.worker_name
            ? t('Have a question? Call your worker, {name}, at', { name: facts.worker_name })
            : t('Have a question? Call your worker at')}{' '}
          <a className="link" href={`tel:${facts.worker_phone.replace(/[^\d]/g, '')}`}>
            {facts.worker_phone}
          </a>
          .
        </p>
      )}

      <button className="button" onClick={() => open('menu')}>
        {t('More help with this letter')}
      </button>
      {getLanguage() === 'es' && <p className="small">{t('Your reply to the county will be in English, because the county reads English.')}</p>}
    </>
  )
}

// True while the phone has internet.
