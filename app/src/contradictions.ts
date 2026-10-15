// Neil's county-mistake rules (core/contradictions.py), on the phone.
//
// Neil wrote the rules in Python. This is a line-by-line copy so they run
// with no internet. It must give the same answers as his Python: the test
// checks it against cases his own code answered (fixtures/contradiction_cases.json).
import rulesFile from '../../core/rules/deadlines.json'
import { evaluate, type RulesFile } from './deadlines'

// One thing that happened, in Neil's shape. An empty proof means none.
export type TimelineEvent = {
  date: string // YYYY-MM-DD
  type: EventKind
  description: string
  subject: string // who did it
  proof: string
}

export const KINDS = [
  'county_sent_letter',
  'letter_arrived',
  'papers_sent',
  'papers_received',
  'receipt_sent',
  'receipt_received',
  'coverage_restored',
  'coverage_denied',
] as const
export type EventKind = (typeof KINDS)[number]

export type Finding = {
  rule: 1 | 2
  date: string
  needs_proof: boolean
  citation: string
  reason: string
}

// Neil's find_papers: the date the papers count from, and whether we still
// need proof. "The county received them" beats "I sent them".
export function findPapers(events: TimelineEvent[]): [string, boolean] | [null, null] {
  let receivedDate: string | null = null
  let sentDate: string | null = null
  let sentProof = ''
  for (const event of events) {
    if (event.type === 'papers_received') {
      receivedDate = event.date
    } else if (event.type === 'papers_sent') {
      sentDate = event.date
      if (event.proof !== '') sentProof = event.proof
    }
  }
  if (receivedDate) return [receivedDate, false]
  if (sentDate) return [sentDate, sentProof === '']
  return [null, null]
}

// Rule 1: papers in on or before the effective date, stopped anyway.
export function checkRule1(events: TimelineEvent[], effectiveDate: string): Finding | null {
  const [papersDate, needsProof] = findPapers(events)
  if (papersDate === null) return null
  if (!events.some((e) => e.type === 'coverage_denied')) return null
  if (papersDate <= effectiveDate) {
    return {
      rule: 1,
      date: papersDate,
      needs_proof: needsProof,
      citation: 'MEDIL I15-22, ACWDL 11-23',
      reason: 'Coverage was denied even though papers were sent in time.',
    }
  }
  return null
}

// Rule 2: papers in during the 90-day cure period, coverage not back.
export function checkRule2(events: TimelineEvent[], noticeDate: string, effectiveDate: string): Finding | null {
  const [papersDate, needsProof] = findPapers(events)
  if (papersDate === null) return null
  const results = evaluate(rulesFile as RulesFile, 'MC_239A', { notice_date: noticeDate }, noticeDate)
  const cureDeadline = results.find((r) => r.id === 'document_request_coverage_stopped')?.date
  if (!cureDeadline) return null
  if (papersDate > effectiveDate && papersDate <= cureDeadline) {
    if (events.some((e) => e.type === 'coverage_restored')) return null
    return {
      rule: 2,
      date: papersDate,
      needs_proof: needsProof,
      citation: 'W&IC 14005.37(a), MEDIL I15-22E',
      reason:
        "Papers came in during the 90-day cure period, but coverage was not restored. If your coverage isn't back soon, check with your county.",
    }
  }
  return null
}

// Both rules at once. Neil's Python needs both dates; without them there is
// nothing to compare, so this returns no findings.
export function findMistakes(events: TimelineEvent[], noticeDate: string | null, effectiveDate: string | null): Finding[] {
  if (!noticeDate || !effectiveDate) return []
  return [checkRule1(events, effectiveDate), checkRule2(events, noticeDate, effectiveDate)].filter(
    (f): f is Finding => f !== null
  )
}
