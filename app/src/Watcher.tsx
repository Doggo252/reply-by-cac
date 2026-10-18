// The watcher's warnings at the top of the letter screen (watcher.ts has the
// rules). Plain app code: no AI, works offline.
import { useEffect, useState } from 'react'
import rulesFile from '../../core/rules/deadlines.json'
import { letterId } from './agentWords'
import { todayOnThisPhone, type RulesFile } from './deadlines'
import { listEvents, loadDone, saveDone, type SavedLetter } from './storage'
import { watch, type Warning } from './watcher'
import { inWords } from './words'

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

  const shown = warnings.filter((w) => w.kind === 'mistake' || !later.includes(w.deadline.id))
  if (shown.length === 0) return null

  return (
    <>
      {shown.map((w) =>
        w.kind === 'deadline' ? (
          <div key={w.deadline.id} className="card warning" role="alert">
            <h2>
              {w.deadline.daysLeft === 0 ? 'Today is the last day' : `Only ${w.deadline.daysLeft} day${w.deadline.daysLeft === 1 ? '' : 's'} left`}
            </h2>
            <p>{w.deadline.label}</p>
            <p>By {inWords(w.deadline.date!)}.</p>
            <p className="small">Did you already do this?</p>
            <button
              className="button"
              onClick={() => {
                const next = [...done, w.deadline.id]
                saveDone(id, next)
                setDone(next)
              }}
            >
              Yes, I did it
            </button>
            <button className="button" onClick={() => setLater([...later, w.deadline.id])}>
              Not yet
            </button>
          </div>
        ) : (
          <div key={`mistake-${w.finding.rule}`} className="card warning" role="alert">
            <h2>The county may have made a mistake</h2>
            <p>{w.finding.reason}</p>
            <p className="small">Law: {w.finding.citation}</p>
            {helperOffered ? (
              <button className="button primary" onClick={onUseHelper}>
                Use AI to prepare my response
              </button>
            ) : (
              <button className="button primary" onClick={onMakeReply}>
                Prepare my response
              </button>
            )}
          </div>
        ),
      )}
    </>
  )
}
