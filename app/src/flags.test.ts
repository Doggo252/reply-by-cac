import { expect, test } from 'vitest'
import { fieldsFor, flagsFor, type FlagInput } from './flags'

const base: FlagInput = {
  fields: fieldsFor('MC355'),
  facts: {
    notice_date: '2026-09-24', due_date: '2026-10-06', ask: 'proof of income',
    worker_name: 'Robert Flores', worker_phone: '(408) 758-3862', case_number: '1B5F324',
  },
  mode: 'ai',
  certainty: 'high',
  photoConfidence: 88,
  repaired: [],
  today: '2026-10-07',
}

test('a clean read flags nothing', () => {
  expect(flagsFor(base)).toEqual({})
})

test('an empty fact is flagged', () => {
  expect(Object.keys(flagsFor({ ...base, facts: { ...base.facts, due_date: null } }))).toEqual(['due_date'])
})

test('phone-only mode flags only the unsure facts, like AI mode (Neil, Oct 18)', () => {
  expect(flagsFor({ ...base, mode: 'phone' })).toEqual({})
  expect(Object.keys(flagsFor({ ...base, mode: 'phone', facts: { ...base.facts, case_number: null } }))).toEqual(['case_number'])
})

test('low AI certainty flags every fact', () => {
  expect(Object.keys(flagsFor({ ...base, certainty: 'low' })).length).toBe(base.fields.length)
})

test('a photo read under 70% flags every fact, 70% does not', () => {
  expect(Object.keys(flagsFor({ ...base, photoConfidence: 69 })).length).toBe(base.fields.length)
  expect(flagsFor({ ...base, photoConfidence: 70 })).toEqual({})
})

test('a due date before the notice date flags both', () => {
  const flags = flagsFor({ ...base, facts: { ...base.facts, due_date: '2026-09-01' } })
  expect(Object.keys(flags).sort()).toEqual(['due_date', 'notice_date'])
})

test('a notice date in the future is flagged', () => {
  const flags = flagsFor({ ...base, facts: { ...base.facts, notice_date: '2026-10-08', due_date: '2026-10-20' } })
  expect(Object.keys(flags)).toEqual(['notice_date'])
})

test('a due date more than 60 days out is flagged', () => {
  const flags = flagsFor({ ...base, facts: { ...base.facts, due_date: '2026-11-24' } })
  expect(Object.keys(flags)).toEqual(['due_date'])
})

test('a repaired case number is flagged', () => {
  expect(Object.keys(flagsFor({ ...base, repaired: ['case_number'] }))).toEqual(['case_number'])
})
