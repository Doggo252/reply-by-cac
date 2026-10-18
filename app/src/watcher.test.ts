import { expect, test } from 'vitest'
import rulesFile from '../../core/rules/deadlines.json'
import type { TimelineEvent } from './contradictions'
import type { RulesFile } from './deadlines'
import { watch } from './watcher'

const rules = rulesFile as RulesFile
const TODAY = '2026-10-18'

test('warns about a deadline 7 days away or less', () => {
  const warnings = watch(rules, 'MC355', { notice_date: '2026-09-22', due_date: '2026-10-22' }, [], TODAY, [])
  expect(warnings).toHaveLength(1)
  expect(warnings[0].kind).toBe('deadline')
  expect(warnings[0].kind === 'deadline' && warnings[0].deadline.daysLeft).toBe(4)
})

test('no warning when the deadline is further away, already passed, or done', () => {
  expect(watch(rules, 'MC355', { due_date: '2026-10-30' }, [], TODAY, [])).toEqual([])
  expect(watch(rules, 'MC355', { due_date: '2026-10-10' }, [], TODAY, [])).toEqual([])
  expect(watch(rules, 'MC355', { due_date: '2026-10-22' }, [], TODAY, ['document_request'])).toEqual([])
})

test('the last day itself still warns', () => {
  const warnings = watch(rules, 'MC355', { due_date: TODAY }, [], TODAY, [])
  expect(warnings.map((w) => w.kind)).toEqual(['deadline'])
})

// Neil's rule 1: papers in before the stop date, stopped anyway.
const MISTAKE: TimelineEvent[] = [
  { date: '2026-10-20', type: 'papers_received', description: 'Dropped off my form', subject: 'County', proof: 'stamp' },
  { date: '2026-11-01', type: 'coverage_denied', description: 'Card stopped working', subject: 'County', proof: '' },
]

test('finds a county mistake on a discontinuance', () => {
  const facts = { notice_date: '2026-10-07', effective_date: '2026-10-31' }
  const warnings = watch(rules, 'MC_239A', facts, MISTAKE, '2026-11-02', [])
  const mistake = warnings.find((w) => w.kind === 'mistake')
  expect(mistake?.kind === 'mistake' && mistake.finding.rule).toBe(1)
})

test('county mistakes are only for a discontinuance', () => {
  const facts = { notice_date: '2026-10-07', effective_date: '2026-10-31', due_date: '2026-12-30' }
  expect(watch(rules, 'MC210_RV', facts, MISTAKE, TODAY, [])).toEqual([])
})
