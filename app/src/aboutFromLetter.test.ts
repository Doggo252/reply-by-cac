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

test('a city with no comma, and no county named (the city tells the county)', () => {
  const text = 'Notice For: Esperanza Hernandez\nEsperanza Hernandez .\n7227 Oak St Notice Date: 10/07/2026\nEast Palo Alto CA 94303-4315'
  expect(aboutFromLetter(text)).toEqual({
    name: 'Esperanza Hernandez',
    street: '7227 Oak St',
    city: 'East Palo Alto',
    zip: '94303',
    county: 'San Mateo',
  })
})

test('a misread name or a label is not taken for a name', () => {
  expect(aboutFromLetter('CASE NAME: witiiam Kim').name).toBeUndefined()
  expect(aboutFromLetter('CASE NAME:\nCALHEERS CASE NUMBER: 70026706').name).toBeUndefined()
})

test('nothing found gives nothing', () => {
  expect(aboutFromLetter('')).toEqual({})
})

// From the Oct 18 walkthroughs.
test('a street with no St or Ave, right above the city line', () => {
  const text = 'CASE NAME: Lorraine Morales\nLorraine Morales\n1240 Broadway\nSunnyvale, CA 94086-1907'
  expect(aboutFromLetter(text)).toMatchObject({ street: '1240 Broadway', city: 'Sunnyvale', zip: '94086' })
})

// From the Oct 20 test kit, as the phone read a photo of it: the address is
// joined with the box beside it, and the ZIP code is garbled.
test('an address joined with the box beside it, and a garbled ZIP', () => {
  const text = [
    'To ask for help in your language, call: (408) 555-0100 (PV) fen lo',
    'R Delgad i .',
    '1240 Broadway Notice date: October 10, 2026',
    'Sunnyvale, ca gq 086 Case number: 7Q2M118',
    'Case name: Rosa Delgado',
    'Worker name: Ana Ruiz',
    'In person to: Santa Clara County Medi-Cal Office',
    'At: 1867 Senter Rd',
    'San Jose, CA 95112',
  ].join('\n')
  expect(aboutFromLetter(text)).toEqual({ name: 'Rosa Delgado', street: '1240 Broadway', city: 'Sunnyvale', county: 'Santa Clara' })
})

test('an apartment number stays with the street', () => {
  const text = 'Case name: Robert Chen\nRobert Chen\n8966 Alameda Ave Apt 23\nMenlo Park CA 94025-5539'
  expect(aboutFromLetter(text)).toMatchObject({ street: '8966 Alameda Ave Apt 23', city: 'Menlo Park', zip: '94025' })
})

// From the Oct 20 run: the county's name was garbled ("COUNTY OF SAN TITS"),
// so the city on the letter tells which county it is.
test('the county, from a city when its name is garbled', () => {
  expect(aboutFromLetter('COUNTY OF SAN TITS\nSouth San Francisco, Ca 94080-9559').county).toBe('San Mateo')
  expect(aboutFromLetter('COUNTY OF 5ANTA CL4RA\nMountain View, CA 94040').county).toBe('Santa Clara')
  expect(aboutFromLetter('East Palo Alto, CA 94303').county).toBe('San Mateo')
})
