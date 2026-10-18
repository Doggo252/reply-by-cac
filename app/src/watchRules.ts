// The watcher (Neil's agent/TOOLS.md, Section 1, point 7). Plain app code,
// no AI, works offline. Each time the letter screen opens it looks for:
//   - the letter's main deadline (letterJob.ts) 7 days away or less, if the
//     person has not said they did it. Never a hearing date: a hearing is a
//     backup, so the app does not push it.
//   - a county mistake, using Neil's county-mistake rules on the timeline
// A pure function, like deadlines.ts: today is passed in, never read here.
import { findMistakes, type Finding, type TimelineEvent } from './contradictions'
import { evaluate, type Deadline, type RulesFile } from './deadlines'
import { MAIN_DEADLINE } from './letterJob'

// "7 days or less" is Neil's high urgency level, the same as the red countdown cards.
export const WARN_DAYS = 7

export type Warning =
  | { kind: 'deadline'; deadline: Deadline }
  | { kind: 'mistake'; finding: Finding }

export function watch(
  rules: RulesFile,
  letterType: string,
  facts: Record<string, string | null>,
  events: TimelineEvent[],
  today: string,
  done: string[], // deadline IDs the person said they already took care of
): Warning[] {
  const warnings: Warning[] = []
  const soon = evaluate(rules, letterType, facts, today)
    .filter((d) => d.id === MAIN_DEADLINE[letterType])
    .filter((d) => d.daysLeft !== null && d.daysLeft >= 0 && d.daysLeft <= WARN_DAYS && !done.includes(d.id))
    .sort((a, b) => a.daysLeft! - b.daysLeft!)
  for (const deadline of soon) warnings.push({ kind: 'deadline', deadline })
  // County mistakes only apply to a discontinuance (MC 239 A).
  if (letterType === 'MC_239A') {
    for (const finding of findMistakes(events, facts.notice_date ?? null, facts.effective_date ?? null)) {
      warnings.push({ kind: 'mistake', finding })
    }
  }
  return warnings
}
