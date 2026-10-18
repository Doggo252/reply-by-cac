import { expect, test } from 'vitest'
import { daysLeftWords, jobFor, timing, whatToSend } from './letterJob'

const TODAY = '2026-10-18'

test('a stopped letter: the job is sending the papers, not a hearing', () => {
  const ask = 'You did not send the following information we asked for: proof of income.'
  const job = jobFor('MC_239A', { notice_date: '2026-10-07', effective_date: '2026-10-31', ask }, TODAY)
  expect(job.headline).toBe('Your Medi-Cal will stop on October 31, 2026')
  expect(job.listTitle).toBe('The county says they never got:')
  expect(job.toSend).toEqual(['Proof of income'])
  expect(job.task).toMatch(/^Send it by /)
  expect(job.task).not.toMatch(/hearing/i)
  expect(job.button).toBe('Help me send my papers')
  expect(job.deadline?.id).toBe('document_request_coverage_stopped')
  expect(job.hearing?.lastDay?.id).toBe('hearing_request')
})

test('a stopped letter after the stop date says stopped', () => {
  const job = jobFor('MC_239A', { notice_date: '2026-09-01', effective_date: '2026-09-30' }, TODAY)
  expect(job.headline).toBe('Your Medi-Cal stopped on September 30, 2026')
  expect(job.toSend).toEqual(['The papers your letter says are missing'])
})

test('a request for papers and a renewal each have one job and no hearing', () => {
  const papers = jobFor('MC355', { notice_date: '2026-10-07', due_date: '2026-11-06', ask: 'They asked for: a bank statement' }, TODAY)
  expect(papers.task).toBe('Send it by Friday, November 6, 2026')
  expect(papers.hearing).toBeNull()
  const renewal = jobFor('MC210_RV', { notice_date: '2026-10-07', due_date: '2026-12-06' }, TODAY)
  expect(renewal.task).toBe('Mail it back by Sunday, December 6, 2026')
  expect(renewal.button).toBe('Help me with my renewal')
  expect(renewal.hearing).toBeNull()
})

test('a missing date still gives a job, with no date in it', () => {
  const job = jobFor('MC355', { notice_date: null, due_date: null }, TODAY)
  expect(job.task).toBe('Send it')
  expect(daysLeftWords(job.deadline)).toBe('')
})

test('a passed date says so plainly', () => {
  const job = jobFor('MC355', { due_date: '2026-10-01' }, TODAY)
  expect(job.task).toBe('The date to send them has passed')
})

test('days left in words', () => {
  const job = jobFor('MC355', { due_date: '2026-10-19' }, TODAY)
  expect(daysLeftWords(job.deadline)).toBe('1 day left')
  expect(daysLeftWords(jobFor('MC355', { due_date: TODAY }, TODAY).deadline)).toBe('Today is the last day')
})

// What the phone reader finds on the fake letters ("ask"), turned into a list.
test('what to send: a missing renewal form', () => {
  expect(whatToSend('MC_239A', 'You did not return your annual renewal form (MC 210 RV) by the due date.')).toEqual([
    'Your renewal form (MC 210 RV), filled in and signed',
  ])
})

test('what to send: a list of missing papers', () => {
  expect(
    whatToSend('MC_239A', 'You did not send the following information we asked for: proof of Medicare premium; proof of your home address.'),
  ).toEqual(['Proof of Medicare premium', 'Proof of your home address'])
})

test('what to send: missing property papers', () => {
  expect(
    whatToSend('MC_239A', 'You did not send information about your property, which is now required for your renewal: real estate, bank accounts.'),
  ).toEqual(['Papers about your property: real estate', 'Papers about your property: bank accounts'])
})

test('what to send: a request for papers points to the checked boxes', () => {
  expect(whatToSend('MC355', 'The papers or information with a checked box on the other pages of this letter.')).toEqual([
    'Each paper with a checked box on the other pages of your letter',
  ])
  expect(whatToSend('MC355', 'They asked for: a bank statement')).toEqual(['A bank statement'])
})

test('what to send: nothing clear, so look at the letter', () => {
  expect(whatToSend('MC_239A', 'We asked you for the information, but we have not received it.')).toEqual([
    'The papers your letter says are missing',
  ])
  expect(whatToSend('MC_239A', null)).toEqual(['The papers your letter says are missing'])
})

test('timing: a week or less is soon, and a weekend last day moves the advice to Friday', () => {
  const soonSaturday = jobFor('MC_239A', { notice_date: '2026-08-10', effective_date: '2026-08-31' }, TODAY).deadline
  expect(timing(soonSaturday)).toEqual({ soon: false, weekendFriday: '2026-11-06' })
  const twoDays = jobFor('MC355', { due_date: '2026-10-20' }, TODAY).deadline
  expect(timing(twoDays)).toEqual({ soon: true, weekendFriday: null })
  const sunday = jobFor('MC210_RV', { due_date: '2026-10-18' }, TODAY).deadline
  expect(timing(sunday)).toEqual({ soon: true, weekendFriday: '2026-10-16' })
})
