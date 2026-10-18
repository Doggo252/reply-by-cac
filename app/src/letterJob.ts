// The one job each letter gives the person, in plain words. The letter screen
// shows only this: what happened, what to do, by when, and one button.
//
// The dates come from Neil's rules (core/rules/deadlines.json). For a letter
// that stopped Medi-Cal, the main job is sending the missing papers, because
// that brings Medi-Cal back (the 90-day cure period). A hearing is only a
// backup, for when the person thinks the county made a mistake.
import rulesFile from '../../core/rules/deadlines.json'
import { evaluate, type Deadline, type RulesFile } from './deadlines'
import { inWords } from './words'

const rules = rulesFile as RulesFile

// Which of Neil's deadlines is the main job for each letter.
export const MAIN_DEADLINE: Record<string, string> = {
  MC_239A: 'document_request_coverage_stopped',
  MC355: 'document_request',
  MC210_RV: 'renewal_request',
}

export type Job = {
  headline: string // what happened
  detail: string | null // what the county said, if we have it
  task: string // what to do, with the date
  why: string // what happens when they do it
  button: string
  deadline: Deadline | null
  // Stopped letters only: the hearing, shown as a backup.
  hearing: { lastDay: Deadline | null; keepsCoverage: Deadline | null } | null
}

export function jobFor(letterType: string, facts: Record<string, string | null>, today: string): Job {
  const deadlines = evaluate(rules, letterType, facts, today)
  const byId = (id: string) => deadlines.find((d) => d.id === id) ?? null
  const deadline = byId(MAIN_DEADLINE[letterType])
  const by = deadline?.date ? ` by ${inWords(deadline.date)}` : ''
  const passed = deadline?.status === 'passed'

  if (letterType === 'MC_239A') {
    const stop = facts.effective_date
    return {
      headline: !stop
        ? 'Your Medi-Cal is being stopped'
        : stop <= today
          ? `Your Medi-Cal stopped on ${inWords(stop, false)}`
          : `Your Medi-Cal will stop on ${inWords(stop, false)}`,
      detail: facts.ask ? `Why: ${facts.ask}` : null,
      task: passed ? 'The 90 days to send your papers have passed' : `Send the missing papers${by}`,
      why: passed
        ? 'You may need to apply again. Call your county worker to ask.'
        : 'Your Medi-Cal comes back. You do not need to apply again.',
      button: 'Get my papers ready',
      deadline,
      hearing: { lastDay: byId('hearing_request'), keepsCoverage: byId('hearing_coverage') },
    }
  }

  if (letterType === 'MC355') {
    return {
      headline: 'The county needs papers from you',
      detail: facts.ask ? `They asked for: ${facts.ask}` : null,
      task: passed ? 'The date to send the papers has passed' : `Send the papers${by}`,
      why: passed
        ? 'Send them anyway, as soon as you can, and call your county worker.'
        : 'If you do not, your Medi-Cal may stop.',
      button: 'Get my papers ready',
      deadline,
      hearing: null,
    }
  }

  return {
    headline: 'It is time to renew your Medi-Cal',
    detail: 'Fill in the paper form that came with this letter.',
    task: passed ? 'The date to send your form has passed' : `Send your renewal form back${by}`,
    why: passed
      ? 'Send it anyway, as soon as you can, and call your county worker.'
      : 'If you do not, your Medi-Cal may stop. We show you which pages to fill in.',
    button: 'Help me fill it in',
    deadline,
    hearing: null,
  }
}

// "74 days left", "Today is the last day", or "" when there is no date.
export function daysLeftWords(deadline: Deadline | null): string {
  if (!deadline || deadline.daysLeft === null) return ''
  if (deadline.status === 'today') return 'Today is the last day'
  if (deadline.status === 'passed') return ''
  return `${deadline.daysLeft} day${deadline.daysLeft === 1 ? '' : 's'} left`
}
