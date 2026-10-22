import { describe, expect, it } from 'vitest'
import { checkPhoto } from './photoCheck'

const TODAY = '2026-10-20'
const BANK = `Golden State Credit Union
Statement period: September 1 - September 30, 2026
ROSA DELGADO, 1240 Broadway, Sunnyvale CA
Ending balance $2,312.45`

describe('checking a photo', () => {
  it('a good bank statement passes, and says what it is', () => {
    expect(checkPhoto('Your newest bank statement', BANK, 'Rosa Delgado', TODAY)).toEqual({
      ok: true,
      problems: [],
      found: 'a bank statement from September 2026',
    })
  })

  it('a photo with no readable words asks for a better photo', () => {
    const check = checkPhoto('Your newest bank statement', '~ ;', 'Rosa Delgado', TODAY)
    expect(check.ok).toBe(false)
    expect(check.problems[0]).toMatch(/couldn't read/)
  })

  // Mom's Oct 21 photo, as the phone read it: page 9 of the renewal form,
  // taken as "the property form".
  it('a page of the renewal form is caught: the app fills that form in', () => {
    const page9 = `Resources and property are things you could exchange for money or that you own.
Review your resources and property information.
Rosa Delgado Checking Golden State Credit Union 1,850`
    const check = checkPhoto('The property form that came with it, filled in', page9, 'Rosa Delgado', TODAY)
    expect(check.ok).toBe(false)
    expect(check.problems[0]).toMatch(/page of your renewal form/)
  })

  it('the wrong kind of paper is caught', () => {
    const check = checkPhoto('Your newest bank statement', 'PG&E electric bill for Rosa Delgado, due October 2, 2026, amount $84.10', 'Rosa Delgado', TODAY)
    expect(check.problems.some((p) => p.includes("doesn't look like a bank statement"))).toBe(true)
  })

  it("someone else's paper is caught, but one misread letter is fine", () => {
    expect(checkPhoto('Your newest bank statement', BANK, 'Maria Garcia', TODAY).problems.some((p) => p.includes('your name'))).toBe(true)
    expect(checkPhoto('Your newest bank statement', BANK.replace('DELGADO', 'DELGAD0'), 'Rosa Delgado', TODAY).ok).toBe(true)
  })

  it('a statement older than 2 months is flagged, with the month in words', () => {
    const old = BANK.replace(/September/g, 'June')
    expect(checkPhoto('Your newest bank statement', old, 'Rosa Delgado', TODAY).problems).toContain(
      'This is from June 2026. The county asks for current proof, so a newer one is better.',
    )
  })

  it('a car registration is not checked for being recent', () => {
    const card = 'DMV Registration Card\nVehicle: Toyota Corolla 2012\nOwner: Rosa Delgado\nIssued January 3, 2025'
    expect(checkPhoto('The registration for your car', card, 'Rosa Delgado', TODAY).ok).toBe(true)
  })
})
