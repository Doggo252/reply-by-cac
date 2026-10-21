import { describe, expect, it } from 'vitest'
import { findAmounts, findCaseNumbers, findDates, findPhones } from './textFinds'
import { choicesFor } from './Confirm'

const LETTER = `County of Santa Clara Social Services Agency
Notice Date: 10/05/2026   Case Number: 7Q2M118
Worker: Ana Ruiz   Phone: (408) 555-0188
Please return your renewal by November 4, 2026.
Questions? Call 408.555.0100.`

describe('finding things in a letter', () => {
  it('finds every date, in any common format', () => {
    expect(findDates(LETTER)).toEqual(['2026-10-05', '2026-11-04'])
    expect(findDates('Statement for September 2026')).toEqual(['2026-09-30'])
    expect(findDates('Not a date: 13/45/2026')).toEqual([])
  })

  it('finds phone numbers, written the usual way', () => {
    expect(findPhones(LETTER)).toEqual(['(408) 555-0188', '(408) 555-0100'])
  })

  it('finds case numbers, but not dates, phones or years', () => {
    expect(findCaseNumbers(LETTER)).toEqual(['7Q2M118'])
    expect(findCaseNumbers('Case 2026 and 4085550188')).toEqual([])
  })

  it('finds dollar amounts', () => {
    expect(findAmounts('Paid $1,240.00 and $35')).toEqual([1240, 35])
  })

  // The Oct 20 test kit: the photo reader wrote "$1 ,240.00".
  it('finds an amount with a stray space inside it', () => {
    expect(findAmounts('before deductions is $1 ,240.00')).toEqual([1240])
    expect(findAmounts('balance $2, 312.45')).toEqual([2312.45])
  })
})

describe('choices on the confirm screen', () => {
  it('offers the dates on the letter, in words', () => {
    expect(choicesFor('notice_date', LETTER)).toEqual([
      { value: '2026-10-05', label: 'October 5, 2026' },
      { value: '2026-11-04', label: 'November 4, 2026' },
    ])
  })

  it('offers phone numbers and case numbers', () => {
    expect(choicesFor('worker_phone', LETTER)[0].value).toBe('(408) 555-0188')
    expect(choicesFor('case_number', LETTER)).toEqual([{ value: '7Q2M118', label: '7Q2M118' }])
  })

  it('offers nothing for a name or the request', () => {
    expect(choicesFor('worker_name', LETTER)).toEqual([])
  })
})
