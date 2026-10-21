// The watcher's warnings at the top of the letter screen (watcher.ts has the
// rules). Plain app code: no AI, works offline.
import { useEffect, useState } from 'react'
import rulesFile from '../../core/rules/deadlines.json'
import { letterId } from './agentWords'
import { todayOnThisPhone, type RulesFile } from './deadlines'
import { listEvents, loadDone, saveDone, type SavedLetter } from './storage'
import { watch, type Warning } from './watchRules'
import { inWords } from './words'
import { t } from './language'

export default function Watcher({ letter, helperOffered, onUseHelper, onMakeReply }: {
  letter: SavedLetter
  helperOffered: boolean // AI mode and online
  onUseHelper: () => void
  onMakeReply: () => void
}) {
  const id = letterId(letter)
  const [done, setDone] = useState<string[]>(() => loadDone(id))
  // "Not yet" hides a warning until the app is opened again.
  const [later, setLater] = useState<string[]>([])
  const [warnings, setWarnings] = useState<Warning[]>([])

  useEffect(() => {
    listEvents()
      .then((events) => setWarnings(watch(rulesFile as RulesFile, letter.letterType, letter.facts, events, todayOnThisPhone(), done)))
      .catch(() => setWarnings([]))
  }, [letter, done])

  // On the day the letter is first read, the letter screen already shows the
  // date and the job, so "Did you already send it?" would only confuse. The
  // deadline warning starts when the person comes back on a later day.
  const firstDay = (letter.savedAt ?? '').slice(0, 10) === new Date().toISOString().slice(0, 10)
  const shown = warnings.filter((w) => w.kind === 'mistake' || (!firstDay && !later.includes(w.deadline.id)))
  if (shown.length === 0) return null

  return (
    <>
      {shown.map((w) =>
        w.kind === 'deadline' ? (
          <div key={w.deadline.id} className="card warning" role="alert">
            <h2>
              {w.deadline.daysLeft === 0
                ? t('Today is the last day')
                : w.deadline.daysLeft === 1
                  ? t('Only 1 day left')
                  : t('Only {n} days left', { n: w.deadline.daysLeft ?? 0 })}
            </h2>
            <p>{t('The last day is {date}. Did you already send it?', { date: inWords(w.deadline.date!) })}</p>
            <div className="button-row">
              <button
                className="button"
                onClick={() => {
                  const next = [...done, w.deadline.id]
                  saveDone(id, next)
                  setDone(next)
                }}
              >
                {t('Yes, I sent it')}
              </button>
              <button className="button" onClick={() => setLater([...later, w.deadline.id])}>
                {t('Not yet')}
              </button>
            </div>
          </div>
        ) : (
          <div key={`mistake-${w.finding.rule}`} className="card warning" role="alert">
            <h2>{t('The county may have made a mistake')}</h2>
            <p>{t(w.finding.reason)}</p>
            <p className="small">{t('Law: {law}', { law: w.finding.citation })}</p>
            <button className="button" onClick={helperOffered ? onUseHelper : onMakeReply}>
              {t('Ask the county to fix it')}
            </button>
          </div>
        ),
      )}
    </>
  )
}
