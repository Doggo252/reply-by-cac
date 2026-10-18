import { expect, test } from 'vitest'
import { closestItem, letterId, logRecord, logWords, restoreLetterBody } from './agentWords'
import type { LogLine } from './agentLoop'

const line = (over: Partial<LogLine>): LogLine => ({
  time: '2026-10-17T18:04:05.000Z', tool: 'get_letter', inputs: 'letter_id="l1"', outcome: 'ok', reason: '', version: null, ...over,
})

test('log lines in plain words', () => {
  expect(logWords(line({}))).toBe('✓ Reading your letter')
  expect(logWords(line({ tool: 'ask_user_to_sign', outcome: 'refuse', reason: 'declined' }))).toBe('Asking you to sign: you said not now')
  expect(logWords(line({ tool: 'propose_packet', outcome: 'refuse', reason: 'no such paper: x' }))).toContain('trying another way')
  expect(logWords(line({ tool: 'build_packet', outcome: 'stop', reason: 'build_packet: not signed' }))).toBe(
    '■ Making your final reply: stopped',
  )
})

test('the log record has the six parts from TOOLS.md, Section 6', () => {
  expect(logRecord(line({ version: 2 }))).toBe('18:04:05 | get_letter | letter_id="l1" | ok | - | v2')
})

test('the restore letter adds the law and skips a blank reason', () => {
  const body = restoreLetterBody({ id: 'draft-restore', kind: 'restore_letter', reason: '', citation: 'MEDIL I15-22, ACWDL 11-23' })
  expect(body).toBe('I am asking you to restore my Medi-Cal.\n\nThis is required by MEDIL I15-22, ACWDL 11-23.\n\nThank you.')
})

test('a letter keeps the same ID', () => {
  const letter = { letterType: 'MC_239A', facts: { notice_date: '2026-10-07' }, savedAt: '2026-10-17T10:00:00.000Z' }
  expect(letterId(letter)).toBe(letterId({ ...letter }))
  expect(letterId(letter)).toBe('letter-MC_239A-1017')
  expect(letterId({ letterType: 'MC355', facts: { notice_date: '2026-10-07' } })).toBe('letter-MC355-1007')
})

test('a photo the AI asks for is saved under the matching checklist line', () => {
  const items = ['Life insurance policy', 'Retirement account statement']
  expect(closestItem('Insurance policy', items)).toBe('Life insurance policy')
  expect(closestItem('Retirement statement', items)).toBe('Retirement account statement')
  expect(closestItem('Driver license', items)).toBe('Driver license')
})
