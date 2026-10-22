import { describe, expect, it } from 'vitest'
import { answersFromRows, medicareParts, readCountyPage, rowWords, type OnFileRow } from './countyForm'

// Page 9 of the test kit, as the phone read Mom's photo of it on Oct 21.
const PAGE_9 = `Resources and property are things you could exchange for money or that you own. You must attach
current proof of resources, property, and any amount owed. For example:
= Bank statement
Review your resources and property information.

Name Type of Resources and Value and Is this correct?
resources property details amount If yes, go to next
and property owed section. If no, update

or add below.
Rosa Delgado Checking Golden State Credit Union 1,850.00
account
$ OYes ONo
Rosa Delgado Vehicle 2012 Toyota Corolla 4,500.00
/ 0.00
$ OYes ONo
AA
= $ OYes ONo
continued on the next page »
MC 210 RV ENG (Rev 10/20) page 9 of 21`

const PAGE_5 = `Income
Review your income information.
Name Source of Gross amount How often? Is this correct?
Rosa Delgado Social Security 1,190.00 Monthly
$ OYes ONo
$ OYes ONo
continued on the next page »`

// Page 5 of the test kit as the phone read it: the box's own heading says
// "Then update or add below", which must not end the box.
const PAGE_5_KIT = `Review your income information.
Name Source of Gross amount = How often? Is this correct?
income (income you (annually, monthly, | If yes, go to the next
get before every 2 weeks, section. If no, give the
deductions) weekly, daily, or you got this income.
hourly) Then update or add
below.
Rosa Delgado Social Security 1,190.00 Monthly
OYes ONo
$
OYes ONo`

const PAGE_11 = `Medicare coverage
Review your Medicare information.
Name Monthly premium Part A Part B Part C Part D Is this correct?
Rosa Delgado 0.00 174.70
OYes ONo
Update or add new Medicare information.`

describe("reading what the county printed", () => {
  it('reads the bank account and the car on the property page', () => {
    expect(readCountyPage(PAGE_9, 'resources')).toEqual([
      { section: 'resources', kind: 'Checking account', details: 'Golden State Credit Union', amounts: ['1,850.00'], often: '' },
      { section: 'resources', kind: 'Vehicle', details: '2012 Toyota Corolla', amounts: ['4,500.00', '0.00'], often: '' },
    ])
  })

  it('reads income and Medicare', () => {
    expect(readCountyPage(PAGE_5, 'income')).toEqual([
      { section: 'income', kind: 'Social Security', details: '', amounts: ['1,190.00'], often: 'Monthly' },
    ])
    expect(readCountyPage(PAGE_5_KIT, 'income')).toEqual([
      { section: 'income', kind: 'Social Security', details: '', amounts: ['1,190.00'], often: 'Monthly' },
    ])
    const [medicare] = readCountyPage(PAGE_11, 'medicare')
    expect(medicareParts(medicare)).toEqual({ a: '0.00', b: '174.70', c: undefined, d: undefined })
  })

  it('finds nothing on the wrong page, or a page with nothing printed', () => {
    expect(readCountyPage(PAGE_9, 'income')).toEqual([])
    expect(readCountyPage('Review your income information.\n$ OYes ONo\n$ OYes ONo', 'income')).toEqual([])
  })

  it('says each line in plain words', () => {
    const [bank, car] = readCountyPage(PAGE_9, 'resources')
    expect(rowWords(bank)).toBe('Checking account, Golden State Credit Union, $1,850.00')
    expect(rowWords(car)).toBe('Vehicle, 2012 Toyota Corolla, $4,500.00, owe $0.00')
    expect(rowWords(readCountyPage(PAGE_11, 'medicare')[0])).toBe('Part B: $174.70 a month')
  })
})

describe('the answers a checked line gives', () => {
  const rows = (correct: boolean): OnFileRow[] =>
    [...readCountyPage(PAGE_5, 'income'), ...readCountyPage(PAGE_9, 'resources'), ...readCountyPage(PAGE_11, 'medicare')].map((row) => ({
      ...row,
      correct,
    }))

  it('a line that is still right answers its questions', () => {
    expect(answersFromRows(rows(true))).toEqual({
      social_security: 'yes',
      social_security_amount: '1,190.00',
      bank: 'yes',
      bank_name: 'Golden State Credit Union',
      bank_balance: '1,850.00',
      car: 'yes',
      car_make: '2012 Toyota Corolla',
      car_worth: '4,500.00',
      car_owe: '0.00',
      medicare: 'yes',
      medicare_part_b_premium: '174.70',
      part_d: 'no',
    })
  })

  it('a line that changed leaves the new amount to be asked', () => {
    expect(answersFromRows(rows(false))).toEqual({
      social_security: 'yes',
      bank: 'yes',
      bank_name: 'Golden State Credit Union',
      car: 'yes',
      car_make: '2012 Toyota Corolla',
      medicare: 'yes',
    })
  })
})
