import { expect, test } from 'vitest'
import { findAsk, findCaseNumber, findFacts, findWorkerName, findWorkerPhone, firstDate, fixCaseNumber } from './localFacts'

// Lines taken from real text-reader output of the fake letters.
test('reads both date styles', () => {
  expect(firstDate('Notice date: 08/13/2026')).toBe('2026-08-13')
  expect(firstDate('due date of November 4, 2026')).toBe('2026-11-04')
  expect(firstDate('Notice Date: 93/02/2026')).toBeNull()
})

test('MC 355: notice date, due date, worker', () => {
  const text = [
    'Notice Date: 07/24/2026',
    'Case Number: 9B7R012',
    'Worker Name: Lorraine Hernandez',
    'Worker Telephone Number: (650) 374-4482',
    'We must receive this information by 08/16/2026 or you may lose your Medi-Cal benefits!',
  ].join('\n')
  const { facts } = findFacts(text, 'MC355', '2026-10-07')
  expect(facts).toEqual({
    notice_date: '2026-07-24', due_date: '2026-08-16', effective_date: null, case_number: '9B7R012',
    worker_name: 'Lorraine Hernandez', worker_phone: '(650) 374-4482', ask: null,
  })
})

test('2007 MC 239 A: the month becomes the last day of that month', () => {
  const text = 'Notice date: 09/20/2026\nYour eligibility to receive Medi-Cal will be discontinued effective the last day of September :'
  expect(findFacts(text, 'MC_239A', '2026-10-07').facts.effective_date).toBe('2026-09-30')
})

test('a December notice about January means next year', () => {
  const text = 'Notice date: 12/10/2026\ndiscontinued effective the last day of January'
  expect(findFacts(text, 'MC_239A', '2026-12-15').facts.effective_date).toBe('2027-01-31')
})

test('CalSAWS MC 239: the "As of" date', () => {
  const text = 'As of 08/31/2026, Medi-Cal eligibility has been discontinued for the following member(s)'
  expect(findFacts(text, 'MC_239A', '2026-10-07').facts.effective_date).toBe('2026-08-31')
})

test('renewal: the due date in step 3', () => {
  const text = 'Step 3; Send the form with proof by the due date of October 27, 2026'
  expect(findFacts(text, 'MC210_RV', '2026-10-07').facts.due_date).toBe('2026-10-27')
})

test('a garbled case number is repaired, and marked as repaired', () => {
  expect(fixCaseNumber('8T6KO09')).toBe('8T6K009')
  expect(fixCaseNumber('§Z8X103')).toBe('5Z8X103')
  expect(findCaseNumber('Case number: 8T6KO09')).toEqual({ value: '8T6K009', repaired: true })
  expect(findCaseNumber('Case Number: 9B7R012')).toEqual({ value: '9B7R012', repaired: false })
})

test('the all-digit CalHEERS number is skipped for the SAWS one', () => {
  expect(findCaseNumber('CALHEERS CASE NUMBER: 28958444\nSAWS CASE NUMBER: 9S4Y593').value).toBe('9S4Y593')
})

// The next tests use lines from the printed test letters
// (data/synthetic/test-letters.pdf), read by the text reader.
test('a notice date whose slashes were read as digits', () => {
  const text = 'NOTICE DATE: 1000712026\nCASE NAME: Gloria Lee'
  expect(findFacts(text, 'MC_239A', '2026-10-15').facts.notice_date).toBe('2026-10-07')
  // Not a real date, so it stays blank.
  expect(findFacts('NOTICE DATE: 1300712026', 'MC_239A', '2026-10-15').facts.notice_date).toBeNull()
})

test('a SAWS case number with a 4 read as "a"', () => {
  const text = 'CALHEERS CASE NUMBER: 70026706\n\u2018SAWS CASE NUMBER 7XaM714\nWORKER NAME: Lorraine Nguyen'
  expect(findCaseNumber(text)).toEqual({ value: '7X4M714', repaired: true })
})

// From the built-in sample letter, read at the new photo size (Oct 18).
test('a case number with a 1 read as "(" or "|"', () => {
  expect(findCaseNumber('Casenumber: OBSP(77')).toEqual({ value: '0B5P177', repaired: true })
  expect(findCaseNumber('Case Number: |R5Y073')).toEqual({ value: '1R5Y073', repaired: true })
  // A clean number with a stray mark after it is still read as it was.
  expect(findCaseNumber('Case Number: 0B5P177)')).toEqual({ value: '0B5P177', repaired: true })
})

test('a phone number whose ")" was read as a 1', () => {
  expect(findWorkerPhone('Worker telephone number: (6691 886-8486')).toBe('(669) 886-8486')
  expect(findWorkerPhone('Worker telephone number: (669) 886-8486')).toBe('(669) 886-8486')
  expect(findWorkerPhone('Telephone: 669-886-8486')).toBe('(669) 886-8486')
})

test('the worker name stops at the next label', () => {
  expect(findWorkerName('Worker name: Harold Hernandez Case name: James Ramirez')).toBe('Harold Hernandez')
  expect(findWorkerName('Worker name: Harold Hernandez\nWorker telephone number: (650) 830-3164')).toBe('Harold Hernandez')
})

test('MC 239 A: what the county is asking for, without the name pushed in from the next column', () => {
  const text = [
    'CASE NAME: Gloria Lee',
    'You did not return your annual renewal form (MC 210 RV) by the due Gloria Lee',
    'date.',
    'Keep your plastic Benefits Identification Card (BIC).',
  ].join('\n')
  expect(findAsk(text, 'MC_239A')).toBe('You did not return your annual renewal form (MC 210 RV) by the due date.')
})

test('MC 239 A: a list of missing papers over two lines', () => {
  const text = 'You did not send the following information we asked for: proof of income;\nvehicle registration.\nWe asked you'
  expect(findAsk(text, 'MC_239A')).toBe(
    'You did not send the following information we asked for: proof of income; vehicle registration.',
  )
})

test('MC 355: points to the checked boxes on the other pages', () => {
  const text = 'We still need the information where there is a box\nchecked on the following pages.'
  expect(findAsk(text, 'MC355')).toContain('checked box')
  expect(findAsk('nothing here', 'MC355')).toBeNull()
})
