import { describe, expect, it } from 'vitest'
import { medicareNumber, readProof, valueInText } from './proofRead'

const SSA = `SOCIAL SECURITY ADMINISTRATION (SAMPLE)
Your new benefit amount
Your monthly benefit before deductions is $1,240.00
The amount we deduct for Medicare medical insurance is $185.00
The amount you will receive after deductions is $1,055.00`

const BANK = `Golden State Credit Union
Statement period: September 1 - September 30, 2026
ROSA DELGADO
Beginning balance $2,104.10
Ending balance $2,312.45`

describe('reading proof papers', () => {
  it('reads the Social Security amount before deductions, and the Medicare premium', () => {
    expect(readProof('social_security', SSA)).toEqual({ social_security_amount: '1,240.00', medicare_part_b_premium: '185.00' })
  })

  it("reads the bank's name and the ending balance", () => {
    expect(readProof('bank', BANK)).toEqual({ bank_name: 'Golden State Credit Union', bank_balance: '2,312.45' })
  })

  it('reads a pension amount and a cash value', () => {
    expect(readProof('pension', 'CalPERS\nGross monthly allowance $612.30\nNet $540.00')).toEqual({ pension_amount: '612.30' })
    expect(readProof('life_insurance', 'Policy 88123\nCash surrender value: $3,450.00')).toEqual({ life_insurance_value: '3,450.00' })
  })

  it('finds nothing on a paper that does not say it', () => {
    expect(readProof('bank', 'a blurry photo')).toEqual({})
  })
})

describe('the Medicare number', () => {
  it('reads it off the card', () => {
    expect(medicareNumber('MEDICARE HEALTH INSURANCE\nMedicare Number 1EG4-TE5-MK73\nROSA DELGADO')).toBe('1EG4-TE5-MK73')
  })

  it('fixes an O read where the pattern needs a zero', () => {
    expect(medicareNumber('1EG4-TE5-MK7O')).toBe('1EG4-TE5-MK70')
    expect(medicareNumber('1EGO TE5 MK73')).toBe('1EG0-TE5-MK73')
  })

  it('ignores words that do not fit the pattern', () => {
    expect(medicareNumber('Case number 7Q2M118 and phone 408-555-0142')).toBeNull()
  })
})

describe('checking a value is on the paper (for the AI helper)', () => {
  it('finds the same amount, however it is written', () => {
    expect(valueInText('bank_balance', '2312.45', BANK)).toBe(true)
    expect(valueInText('bank_balance', '$2,312.45', BANK)).toBe(true)
    expect(valueInText('bank_balance', '2400.00', BANK)).toBe(false)
  })

  it('finds the bank name and the Medicare number', () => {
    expect(valueInText('bank_name', 'golden state credit union', BANK)).toBe(true)
    expect(valueInText('medicare_number', '1EG4TE5MK73', 'Number: 1EG4-TE5-MK73')).toBe(true)
  })

  it('an empty value is never on the paper', () => {
    expect(valueInText('bank_name', ' ', BANK)).toBe(false)
  })
})
