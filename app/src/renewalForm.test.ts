/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFCheckBox, PDFTextField } from 'pdf-lib'
import { paperFactsFrom } from './packet'
import type { OnFileRow } from './countyForm'
import {
  blankFacts,
  fillRenewalForm,
  money,
  nextQuestion,
  proofKind,
  renewalLines,
  renewalPapers,
  visibleQuestions,
  type RenewalAnswers,
} from './renewalForm'

const FORM = new Uint8Array(readFileSync(new URL('../public/forms/mc210rv.pdf', import.meta.url)))
const about = { name: 'Rosa Delgado', phone: '(408) 555-0142', street: '1240 Broadway', city: 'Sunnyvale', zip: '94086', county: 'Santa Clara' as const }
const facts = paperFactsFrom({ notice_date: '2026-10-05', due_date: '2026-11-04', case_number: '7Q2M118', worker_name: 'Ana Ruiz', worker_phone: '4085550188' })

// Rosa, from the test kit: lives alone, Social Security, a bank account, a car, Medicare.
const rosa: RenewalAnswers = {
  date_of_birth: '1953-03-14',
  household_change: 'no',
  social_security: 'yes',
  social_security_amount: '1240',
  pension: 'no',
  job: 'no',
  other_income: 'no',
  income_changes: 'no',
  free_help: 'no',
  bank: 'yes',
  bank_name: 'Golden State Credit Union',
  bank_balance: '2312.45',
  car: 'yes',
  car_make: 'Toyota Corolla 2012',
  car_worth: '4000',
  car_owe: '0',
  other_property: 'no',
  life_insurance: 'no',
  medicare: 'yes',
  medicare_number: '1EG4-TE5-MK73',
  medicare_part_b_premium: '185',
  part_d: 'yes',
  part_d_premium: '35',
  long_term_care: 'no',
  other_insurance: 'no',
}

describe('the renewal questions', () => {
  it('asks follow-ups only after a yes', () => {
    const ids = (a: RenewalAnswers) => visibleQuestions(a).map((q) => q.id)
    expect(ids({ social_security: 'no' })).not.toContain('social_security_amount')
    expect(ids({ social_security: 'yes' })).toContain('social_security_amount')
    expect(ids({ medicare: 'yes', part_d: 'no' })).not.toContain('part_d_premium')
  })

  it('goes to the next unanswered question, and ends when all are answered', () => {
    expect(nextQuestion({})?.id).toBe('date_of_birth')
    expect(nextQuestion({ date_of_birth: '1953-03-14' })?.id).toBe('household_change')
    expect(nextQuestion(rosa)).toBeNull()
  })

  it('"I don\'t know" counts as answered', () => {
    expect(nextQuestion({ ...rosa, bank_balance: '' })).toBeNull()
  })

  // A photo of a paper can fill these in later (the bank statement: the bank's name).
  it('knows which facts are still blank, only for things the person has', () => {
    expect(blankFacts({ bank: 'yes', bank_name: '', bank_balance: '2312.45', pension: 'no' })).toEqual(['bank_name'])
    expect(blankFacts({ bank: 'no' })).toEqual([])
    expect(proofKind('Your newest bank statement')).toBe('bank')
    expect(proofKind('Proof of your address, like a rent receipt or a utility bill')).toBeNull()
  })

  it('asks for proof of each thing the person has', () => {
    expect(renewalPapers(rosa)).toEqual(['Your Social Security letter', 'Your newest bank statement', 'The registration for your car'])
  })

  it('writes amounts the way the form wants them', () => {
    expect(money('1240')).toBe('1,240.00')
    expect(money('$2,312.4')).toBe('2,312.40')
    expect(money('about 40')).toBe('about 40')
  })

  it('sums up the answers in plain lines', () => {
    const lines = renewalLines(rosa)
    expect(lines).toContain('Social Security: $1,240.00 a month')
    expect(lines).toContain('Bank account: Golden State Credit Union, $2,312.45')
    expect(lines).toContain('Medicare number: 1EG4-TE5-MK73')
    expect(lines).toContain('Household: no one moved in or out')
  })
})

describe('filling in the official form', () => {
  it('writes each answer in the right box', async () => {
    const doc = await fillRenewalForm(FORM, { answers: rosa, about, facts, today: '2026-10-20' })
    const form = doc.getForm()
    const text = (name: string) => (form.getField(name) as PDFTextField).getText()
    const ticked = (name: string) => (form.getField(name) as PDFCheckBox).isChecked()
    expect(text('Case number')).toBe('7Q2M118')
    expect(text('Recipient 1')).toBe('Rosa Delgado')
    expect(text('Recipient 1: Date of birth')).toBe('03/14/1953')
    expect(text('Date to respond by')).toBe('November 4, 2026')
    expect(text('contact_home_address')).toBe('Sunnyvale, CA 94086')
    expect(ticked('a-1')).toBe(true)
    expect(ticked('household_correct_1-1')).toBe(true)
    expect(text('update_income_source_1')).toBe('Social Security')
    expect(text('update_income_gross_1')).toBe('1,240.00')
    expect(text('update_resources_details_1')).toBe('Golden State Credit Union')
    expect(text('update_resources_report_1')).toBe('Balance: $2,312.45')
    expect(text('vehicle_make')).toBe('Toyota Corolla 2012')
    expect(text('update_medicare_number_1')).toBe('1EG4-TE5-MK73')
    expect(text('update_medicare_partb_1')).toBe('185.00')
    expect(text('update_medicare_partd_1')).toBe('35.00')
    expect(ticked('d-2')).toBe(true)
    expect(ticked('c-2')).toBe(true)
    expect(text('Recipient name and address')).toBe('Rosa Delgado\n1240 Broadway, Sunnyvale, CA 94086')
    expect(text('sig_date')).toBe('10/20/2026')
  })

  it('a household change goes in the update box, and the "correct" box stays empty', async () => {
    const doc = await fillRenewalForm(FORM, {
      answers: { ...rosa, household_change: 'yes', household_change_who: 'Luis Delgado', household_change_what: 'Moved in' },
      about,
      facts,
      today: '2026-10-20',
    })
    const form = doc.getForm()
    expect((form.getField('update_household_name_1') as PDFTextField).getText()).toBe('Luis Delgado')
    expect((form.getField('household_correct_1-1') as PDFCheckBox).isChecked()).toBe(false)
  })

  it('leaves out what the person said no to', async () => {
    const doc = await fillRenewalForm(FORM, { answers: { ...rosa, car: 'no', medicare: 'no' }, about, facts, today: '2026-10-20' })
    const form = doc.getForm()
    expect((form.getField('vehicle_make') as PDFTextField).getText()).toBeUndefined()
    expect((form.getField('update_medicare_number_1') as PDFTextField).getText()).toBeUndefined()
  })

  // Oct 21: what the county printed goes back in its "Review" boxes with Yes
  // or No; only what changed is written again as an update.
  it("copies the county's lines back with Yes or No, and updates only what changed", async () => {
    const onFile: OnFileRow[] = [
      { section: 'income', kind: 'Social Security', details: '', amounts: ['1,190.00'], often: 'Monthly', correct: false },
      { section: 'resources', kind: 'Checking account', details: 'Golden State Credit Union', amounts: ['1,850.00'], often: '', correct: false },
      { section: 'resources', kind: 'Vehicle', details: '2012 Toyota Corolla', amounts: ['4,500.00', '0.00'], often: '', correct: true },
      { section: 'medicare', kind: 'Medicare', details: '', amounts: ['0.00', '174.70'], often: '', correct: true },
    ]
    const doc = await fillRenewalForm(FORM, { answers: { ...rosa, on_file: JSON.stringify(onFile) }, about, facts, today: '2026-10-21' })
    const form = doc.getForm()
    const text = (name: string) => (form.getField(name) as PDFTextField).getText()
    const ticked = (name: string) => (form.getField(name) as PDFCheckBox).isChecked()
    // The Review boxes, as the county printed them.
    expect(text('income_source_1')).toBe('Social Security')
    expect(text('income_gross_1')).toBe('1,190.00')
    expect(ticked('income_correct_1-2')).toBe(true) // No: it changed
    expect(text('resources_details_2')).toBe('2012 Toyota Corolla')
    expect(text('resources_amount_2')).toBe('4,500.00 / 0.00')
    expect(ticked('resources_correct_2-1')).toBe(true) // Yes: still right
    expect(text('medicare_partb_1')).toBe('174.70')
    expect(ticked('medicare_correct_1-1')).toBe(true)
    // What changed is written again; what is still right is not.
    expect(text('update_income_gross_1')).toBe('1,240.00')
    expect(text('update_resources_report_1')).toBe('Balance: $2,312.45')
    expect(ticked('f-2')).toBe(true) // the car: no change
    expect(text('vehicle_make')).toBeUndefined()
    expect(text('update_medicare_partb_1')).toBeUndefined()
  })
})
