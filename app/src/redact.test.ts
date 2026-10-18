import { expect, test } from 'vitest'
import { redact } from './redact'
import cases from './fixtures/redact_cases.json'

test('blanks a Social Security number', () => {
  const { text, counts } = redact('SSN: 123-45-6789 on file')
  expect(text).toBe('SSN: [ssn] on file')
  expect(counts.ssn).toBe(1)
})

test('blanks any run of 6 or more digits', () => {
  expect(redact('id 1234567 and 987654321').text).toBe('id [number] and [number]')
})

test('leaves short numbers, dates, and phone numbers alone', () => {
  const kept = 'Notice date: 08/12/2026 Worker telephone number: (408) 758-3862 ZIP 94024-5804'
  expect(redact(kept).text).toBe(kept)
})

test('blanks a case number in the #L#L### pattern anywhere', () => {
  expect(redact('write 0B5P177 on all papers').text).toBe('write [case] on all papers')
})

test('blanks whatever follows a case number label, even if OCR mangled it', () => {
  const { text } = redact('Case Number: OB5P1?7\nWorker Name: Tong K')
  expect(text).toBe('Case Number: [case]\nWorker Name: Tong K')
})

test('blanks the CalSAWS ID block', () => {
  const { text, counts } = redact('SAWS CASE NUMBER: 1B7P329\nCALHEERS CASE NUMBER:\nCUSTOMER ID: 3556107')
  expect(text).toBe('SAWS CASE NUMBER: [case]\nCALHEERS CASE NUMBER:\nCUSTOMER ID: [case]')
  // 1B7P329 is counted once (by the pattern rule); the customer ID was
  // counted as a long number.
  expect(counts.case).toBe(1)
  expect(counts.number).toBe(1)
})

test('blanks the name after "Notice for" and "Case Name"', () => {
  const { text } = redact('Notice For: Maria Garcia\nCase Name : Maria Garcia\nWorker Name: Tong K')
  expect(text).toBe('Notice For: [name]\nCase Name : [name]\nWorker Name: Tong K')
})

test('blanks a name printed on the line after "Name(s):"', () => {
  const { text } = redact('Name(s):\nMaria Garcia\n\nMedi-Cal is being denied for:')
  expect(text).toBe('Name(s):\n[name]\n\nMedi-Cal is being denied for:')
})

test('blanks the street address, city line, and the name above them', () => {
  const { text, counts } = redact('Maria Garcia\n506 Alameda Ave\nGilroy CA 95020-0903\nWe have reviewed')
  expect(text).toBe('[name]\n[address]\n[address]\nWe have reviewed')
  expect(counts.address).toBe(2)
})

test('keeps the worker name and phone, which the reply needs', () => {
  const { text } = redact('Worker name: Robert Smith\nWorker telephone number: (669) 886-8486')
  expect(text).toBe('Worker name: Robert Smith\nWorker telephone number: (669) 886-8486')
})

test('a real-looking OCR header comes out clean', () => {
  const ocr = [
    'MEDI-CAL REQUEST FOR INFORMATION',
    'Notice Date: 12/08/2022',
    'Case Number: 1B7P329',
    'Worker Name: Tong Kannalikham',
    'Worker ID Number: A579',
    'Worker Telephone Number: (408) 758-3862',
    'Notice For: Grandpa Patil',
    'We must receive this information by 12/20/2022',
  ].join('\n')
  const { text } = redact(ocr)
  expect(text).not.toContain('1B7P329')
  expect(text).not.toContain('Grandpa')
  expect(text).toContain('12/20/2022')
  expect(text).toContain('A579')
})

// The cases below came from real text-reader output; the same checks are in
// backend/tests/test_redact.py.
test('merged columns do not leak the case number or name', () => {
  const { text } = redact('Robert Ramirez Case number: _1C6T512\nNotice for: Robert Ramirez')
  expect(text).not.toContain('1C6T512')
  expect(text).not.toContain('Robert Ramirez')
})

test('a case number misread by the text reader is still caught', () => {
  expect(redact('CalHEERS\n187P329\nWorker ID: A579').text).toBe('CalHEERS\n[case]\nWorker ID: A579')
})

test('a name glued to a label, or wrapped in junk, is caught', () => {
  const { text } = redact('Harold Lopez Case number: 1C6T512\ni Wei Le 4\nLinh Johnson 2 i es')
  expect(text).not.toMatch(/Harold|Wei Le|Linh Johnson/)
})

test('a city line with junk after the ZIP is caught', () => {
  expect(redact('Los Altos, CA 94024-5804 oie').text).toBe('[address]')
})

test('titles and form lines are not mistaken for names', () => {
  const { text } = redact('MEDI-CAL REQUEST FOR INFORMATION\nNOTICE OF ACTION\nSocial Services Agency')
  expect(text).toBe('MEDI-CAL REQUEST FOR INFORMATION\nNOTICE OF ACTION\nSocial Services Agency')
})

// From a phone photo of the printed test letter (Oct 18): the line after
// "discontinued for:" was ordinary words, not a name, and "Name(s):" was
// followed by a date. Neither may be blanked all over the page.
test('ordinary words or a date after a name label are not hidden everywhere', () => {
  const text = [
    'Name(s): 10/31/2026.',
    'Medi-Cal benefits will be discontinued for:',
    'Keep your plastic card. Please do not throw the card away.',
    'We asked you for the information, but we have not received it and it is essential in determining your Medi-Cal eligibility.',
  ].join('\n')
  const clean = redact(text).text
  expect(clean).toContain('We asked you for the information, but we have not received it')
  expect(clean).toContain('determining your Medi-Cal eligibility')
  expect(redact(text).names).toEqual([])
})

// The phone and the server must blank exactly the same things. These are the
// server's answers on 200 test letters (core/eval/make_redact_cases.py).
test('gives the same answers as the server copy, backend/redact.py', () => {
  for (const c of cases as { text: string; clean: string }[]) expect(redact(c.text).text).toBe(c.clean)
})
