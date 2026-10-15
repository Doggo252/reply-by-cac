import { describe, expect, it } from 'vitest'
import cases from './fixtures/checker_cases.json'
import { check, normalizeDate } from './checker'

type Cases = {
  dates: { text: string; answer: string | null }[]
  forms: { form: Record<string, string>; facts: Record<string, string | null>; answer: unknown }[]
}
const { dates, forms } = cases as Cases

describe("Neil's checker on the phone", () => {
  it('reads every date spelling the same way his Python does', () => {
    for (const { text, answer } of dates) expect([text, normalizeDate(text)]).toEqual([text, answer])
  })

  it('gives the same mismatches as his Python on every saved form', () => {
    for (const { form, facts, answer } of forms) expect(check(form, facts)).toEqual(answer)
  })

  it('the demo moment: a planted wrong date blocks signing', () => {
    const found = check({ notice_date: '10/03/2026' }, { notice_date: '2026-10-01' })
    expect(found).toHaveLength(1)
    expect(found[0].field).toBe('notice_date')
  })
})
