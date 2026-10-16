import { describe, expect, it } from 'vitest'
import cases from './fixtures/grounding_cases.json'
import { inventedDates } from './grounding'

type Case = { text: string; facts: Record<string, string>; answer: string[] }

describe('the grounding check on the phone', () => {
  it('finds the same made-up dates as backend/grounding.py on every saved text', () => {
    for (const { text, facts, answer } of cases as Case[]) expect([text, inventedDates(text, facts)]).toEqual([text, answer])
  })

  it('lets through a date from the facts, with or without the year', () => {
    expect(inventedDates('I sent them on October 3, 2026 and again Oct 3.', { notice_date: '2026-10-03' })).toEqual([])
  })

  it('catches a date the AI made up', () => {
    expect(inventedDates('I sent them on 10/05/2026.', { notice_date: '2026-10-03' })).toEqual(['2026-10-05'])
  })
})
