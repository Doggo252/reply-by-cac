import { expect, test } from 'vitest'
import { daysLeftWords, jobFor } from './letterJob'

const TODAY = '2026-10-18'

test('a stopped letter: the job is sending the papers, not a hearing', () => {
  const job = jobFor('MC_239A', { notice_date: '2026-10-07', effective_date: '2026-10-31', ask: 'proof of income' }, TODAY)
  expect(job.headline).toBe('Your Medi-Cal will stop on October 31, 2026')
  expect(job.detail).toBe('Why: proof of income')
  expect(job.task).toMatch(/^Send the missing papers by /)
  expect(job.task).not.toMatch(/hearing/i)
  expect(job.button).toBe('Get my papers ready')
  expect(job.deadline?.id).toBe('document_request_coverage_stopped')
  expect(job.hearing?.lastDay?.id).toBe('hearing_request')
})

test('a stopped letter after the stop date says "stopped"', () => {
  const job = jobFor('MC_239A', { notice_date: '2026-09-01', effective_date: '2026-09-30' }, TODAY)
  expect(job.headline).toBe('Your Medi-Cal stopped on September 30, 2026')
  expect(job.detail).toBeNull()
})

test('a request for papers and a renewal each have one job and no hearing', () => {
  const papers = jobFor('MC355', { notice_date: '2026-10-07', due_date: '2026-11-06', ask: 'a bank statement' }, TODAY)
  expect(papers.task).toBe('Send the papers by Friday, November 6, 2026')
  expect(papers.hearing).toBeNull()
  const renewal = jobFor('MC210_RV', { notice_date: '2026-10-07', due_date: '2026-12-06' }, TODAY)
  expect(renewal.button).toBe('Help me fill it in')
  expect(renewal.hearing).toBeNull()
})

test('a missing date still gives a job, with no date in it', () => {
  const job = jobFor('MC355', { notice_date: null, due_date: null }, TODAY)
  expect(job.task).toBe('Send the papers')
  expect(daysLeftWords(job.deadline)).toBe('')
})

test('a passed date says so plainly', () => {
  const job = jobFor('MC355', { due_date: '2026-10-01' }, TODAY)
  expect(job.task).toBe('The date to send the papers has passed')
})

test('days left in words', () => {
  const job = jobFor('MC355', { due_date: '2026-10-19' }, TODAY)
  expect(daysLeftWords(job.deadline)).toBe('1 day left')
  expect(daysLeftWords(jobFor('MC355', { due_date: TODAY }, TODAY).deadline)).toBe('Today is the last day')
})
