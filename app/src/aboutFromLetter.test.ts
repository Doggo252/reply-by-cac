import { expect, test } from 'vitest'
import { aboutFromLetter } from './aboutFromLetter'

// Lines from the printed test letters, as the text reader read them.
test('a discontinuance: skips the county office address at the top', () => {
  const text = [
    'Santa Clara County Social Services COUNTY OF SANTA CLARA',
    '2351 Monroe St HEALTH AND WELFARE AGENCY',
    'Gilroy CA 95020-7124 DEPARTMENT OF SOCIAL SERVICES',
    'CASE NAME: Gloria Lee',
    'NOTICE OF ACTION Gloria Lee',
    'MEDI-CAL DENIAL AND 5212 Alameda Ave',
    'Palo Alto, CA 94301-7513',
  ].join('\n')
  expect(aboutFromLetter(text)).toEqual({
    name: 'Gloria Lee', street: '5212 Alameda Ave', city: 'Palo Alto', zip: '94301', county: 'Santa Clara',
  })
})

test('a city with no comma, and no county named', () => {
  const text = 'Notice For: Esperanza Hernandez\nEsperanza Hernandez .\n7227 Oak St Notice Date: 10/07/2026\nEast Palo Alto CA 94303-4315'
  expect(aboutFromLetter(text)).toEqual({ name: 'Esperanza Hernandez', street: '7227 Oak St', city: 'East Palo Alto', zip: '94303' })
})

test('a misread name or a label is not taken for a name', () => {
  expect(aboutFromLetter('CASE NAME: witiiam Kim').name).toBeUndefined()
  expect(aboutFromLetter('CASE NAME:\nCALHEERS CASE NUMBER: 70026706').name).toBeUndefined()
})

test('nothing found gives nothing', () => {
  expect(aboutFromLetter('')).toEqual({})
})
