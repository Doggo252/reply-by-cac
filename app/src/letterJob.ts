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
  listTitle: string // the words above the list of papers
  toSend: string[] // the papers to send (whatToSend below)
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
  const toSend = whatToSend(letterType, facts.ask ?? null)
  const them = toSend.length === 1 ? 'it' : 'them'

  if (letterType === 'MC_239A') {
    const stop = facts.effective_date
    return {
      headline: !stop
        ? 'Your Medi-Cal is going to stop'
        : stop <= today
          ? `Your Medi-Cal stopped on ${inWords(stop, false)}`
          : `Your Medi-Cal will stop on ${inWords(stop, false)}`,
      listTitle: 'The county says they never got:',
      toSend,
      task: passed ? 'The 90 days to send them are over' : `Send ${them}${by}`,
      why: passed
        ? 'Call your county worker. You may need to apply again.'
        : 'Then your Medi-Cal comes back, and you won\'t have to apply again.',
      button: 'Help me send my papers',
      deadline,
      hearing: { lastDay: byId('hearing_request'), keepsCoverage: byId('hearing_coverage') },
    }
  }

  if (letterType === 'MC355') {
    return {
      headline: 'The county needs some papers from you',
      listTitle: 'They asked for:',
      toSend,
      task: passed ? 'The date to send them has passed' : `Send ${them}${by}`,
      why: passed
        ? 'Send them as soon as you can, and call your county worker.'
        : 'If they don\'t get them, your Medi-Cal could stop.',
      button: 'Help me send my papers',
      deadline,
      hearing: null,
    }
  }

  return {
    headline: 'It\'s time to renew your Medi-Cal',
    listTitle: 'You\'ll need to send back:',
    toSend,
    task: passed ? 'The date to send it back has passed' : `Mail it back${by}`,
    why: passed
      ? 'Send it as soon as you can, and call your county worker.'
      : 'If you don\'t, your Medi-Cal could stop. We\'ll show you which pages to fill in.',
    button: 'Help me with my renewal',
    deadline,
    hearing: null,
  }
}

// The papers the person needs to send, as a plain list, worked out from what
// the county asked for ("ask" on the confirm screen). When the letter does not
// say clearly, the list points the person back to their letter.
export function whatToSend(letterType: string, ask: string | null): string[] {
  const text = (ask ?? '').replace(/\s+/g, ' ').trim()
  const tidy = (item: string) => {
    const clean = item.trim().replace(/^and\s+/i, '').replace(/[.;,]+$/, '')
    return clean.charAt(0).toUpperCase() + clean.slice(1)
  }
  const list = (items: string) => items.split(/;|,(?![^(]*\))/).map(tidy).filter((item) => item.length > 2)

  if (letterType === 'MC210_RV') {
    return [
      'Your renewal form (MC 210 RV), filled in and signed',
      'The property form that came with it, filled in',
      'Proof for the form, like a Social Security letter or a bank statement',
    ]
  }

  if (letterType === 'MC355') {
    const named = /asked for\s*:?\s*(.+)/i.exec(text)
    if (named && !/checked box/i.test(text)) return list(named[1])
    return ['Each paper with a checked box on the other pages of your letter']
  }

  // A notice that Medi-Cal is stopping.
  if (/renewal form|mc ?210/i.test(text)) return ['Your renewal form (MC 210 RV), filled in and signed']
  const property = /property[^:]*:\s*(.+)/i.exec(text)
  if (property) {
    // "real estate" is often split over two lines, so only "real" is read.
    return list(property[1]).map((item) => `Papers about your property: ${item.toLowerCase().replace(/^real$/, 'real estate')}`)
  }
  const asked = /asked for\s*:\s*(.+)/i.exec(text)
  if (asked) return list(asked[1])
  return ['The papers your letter says are missing']
}

// Advice about getting it there in time. Mail can take a week, and county
// offices are closed on weekends.
export function timing(deadline: Deadline | null): { soon: boolean; weekendFriday: string | null } {
  if (!deadline?.date || deadline.daysLeft === null || deadline.daysLeft < 0) return { soon: false, weekendFriday: null }
  const day = new Date(`${deadline.date}T00:00:00Z`).getUTCDay() // 0 Sunday, 6 Saturday
  const back = day === 6 ? 1 : day === 0 ? 2 : 0
  const friday = back ? new Date(Date.parse(`${deadline.date}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10) : null
  return { soon: deadline.daysLeft <= 7, weekendFriday: friday }
}

// "74 days left", "Today is the last day", or "" when there is no date.
export function daysLeftWords(deadline: Deadline | null): string {
  if (!deadline || deadline.daysLeft === null) return ''
  if (deadline.status === 'today') return 'Today is the last day'
  if (deadline.status === 'passed') return ''
  return `${deadline.daysLeft} day${deadline.daysLeft === 1 ? '' : 's'} left`
}
