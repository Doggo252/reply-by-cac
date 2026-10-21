/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { check } from './checker'
import {
  bodyOnly,
  buildPacket,
  coverLetter,
  hearingRequest,
  inMyWords,
  longDate,
  paperFactsFrom,
  printable,
  usDate,
  usPhone,
  type CoverLetterInput,
  type PacketInput,
} from './packet'

const form = (name: string) => new Uint8Array(readFileSync(new URL(`../public/forms/${name}`, import.meta.url)))
// A tiny real PNG (1 by 1 pixel), standing in for a signature and a photo.
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0)
)

const confirmed = {
  notice_date: '2026-10-01',
  effective_date: '2026-10-31',
  ask: 'Return the renewal form',
  worker_name: 'Arturo Chen',
  worker_phone: '4088170601',
  case_number: '1C6T512',
}

function input(changes: Partial<PacketInput> = {}): PacketInput {
  return {
    letterType: 'MC_239A',
    about: { name: 'Rosa Flores', phone: '(408) 555-0199', street: '7167 Tully Rd', city: 'Gilroy', zip: '95020', county: 'Santa Clara' },
    facts: paperFactsFrom(confirmed),
    today: '2026-10-20',
    hearing: { reason: 'I sent my renewal form on October 20, 2026, before my coverage was set to stop.' },
    undoLetter: 'I turned in my papers before October 31, 2026. Please restore my Medi-Cal.',
    attachments: [{ name: 'Mail receipt', type: 'image/png', bytes: PNG }],
    signature: PNG,
    forms: { hearingRequest: form('hearing-request.pdf'), renewalSignaturePage: form('mc210rv-signature-page.pdf') },
    ...changes,
  }
}

describe('the reply packet', () => {
  it('writes facts the way American forms do', () => {
    expect(usDate('2026-10-01')).toBe('10/01/2026')
    expect(usPhone('4088170601')).toBe('(408) 817-0601')
    expect(paperFactsFrom(confirmed)).toEqual({
      notice_date: '10/01/2026',
      effective_date: '10/31/2026',
      worker_name: 'Arturo Chen',
      worker_phone: '(408) 817-0601',
      case_number: '1C6T512',
    })
  })

  it("the papers pass Neil's checker against the confirmed facts", () => {
    const { ask: _ask, ...facts } = confirmed
    expect(check(paperFactsFrom(confirmed), facts)).toEqual([])
  })

  it('fills the official hearing request form', async () => {
    const packet = await PDFDocument.create()
    const fonts = { regular: await packet.embedFont(StandardFonts.Helvetica), bold: await packet.embedFont(StandardFonts.HelveticaBold) }
    const { doc, overflow } = await hearingRequest(input(), fonts)
    const fields = doc.getForm()
    expect(fields.getTextField('Name').getText()).toBe('Rosa Flores')
    expect(fields.getTextField('Dept of').getText()).toBe('Santa Clara')
    expect(fields.getCheckBox('Med').isChecked()).toBe(true)
    expect(fields.getTextField('Date Sign1').getText()).toBe('10/20/2026')
    expect(fields.getTextField('Herte is why').getText()).toMatch(/^I sent my renewal/)
    expect(overflow).toBeNull()
  })

  it('a long reason goes on an extra page, and the form says so', async () => {
    const packet = await PDFDocument.create()
    const fonts = { regular: await packet.embedFont(StandardFonts.Helvetica), bold: await packet.embedFont(StandardFonts.HelveticaBold) }
    const { doc, overflow } = await hearingRequest(input({ hearing: { reason: 'word '.repeat(200) } }), fonts)
    expect(overflow).not.toBeNull()
    expect(doc.getForm().getCheckBox('Check Here').isChecked()).toBe(true)
  })

  it('builds a signed packet with a cover sheet and every page', async () => {
    const bytes = await buildPacket(input(), [], true)
    const doc = await PDFDocument.load(bytes)
    // cover, hearing request, restore letter, the attached photo
    expect(doc.getPageCount()).toBe(4)
  })

  it('refuses a final packet that is not signed', async () => {
    await expect(buildPacket(input({ signature: null }), [], true)).rejects.toThrow('not signed')
  })

  it('refuses a final packet when the checker found a mismatch', async () => {
    const mismatch = [{ field: 'notice_date', form: '10/03/2026', fact: '2026-10-01' }]
    await expect(buildPacket(input(), mismatch, true)).rejects.toThrow('do not match')
  })

  it('an unsigned preview is still allowed', async () => {
    const bytes = await buildPacket(input({ signature: null }), [], false)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(4)
  })

  it('a renewal packet uses the MC 210 RV signature page', async () => {
    const bytes = await buildPacket(input({ letterType: 'MC210_RV', hearing: null, undoLetter: null, attachments: [] }), [], true)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2)
  })

  it('letters the PDF font cannot write become ?, not a crash', () => {
    expect(printable('José “Pepe” Núñez 李')).toBe('José "Pepe" Núñez ?')
  })
})

describe('the cover letter', () => {
  const words = (changes: Partial<CoverLetterInput> = {}) =>
    coverLetter({ ...input(), hearing: true, undoLetter: true, toSend: ['Your newest bank statement'], ...changes })

  it('reads like a letter: address, date, who it is to, what it is about', () => {
    const letter = words()
    expect(letter.from).toEqual(['Rosa Flores', '7167 Tully Rd', 'Gilroy, CA 95020', '(408) 555-0199'])
    expect(letter.date).toBe('October 20, 2026')
    expect(letter.to).toEqual(['Santa Clara County Medi-Cal', 'Attn: Arturo Chen'])
    expect(letter.re).toBe('Re: Case number 1C6T512, your letter dated October 1, 2026')
    expect(letter.greeting).toBe('Dear Arturo Chen,')
    expect(letter.closing).toBe('Sincerely,')
  })

  it('says when Medi-Cal stops, in the right tense', () => {
    expect(words().paragraphs[0]).toContain('will stop on October 31, 2026')
    expect(words({ today: '2026-11-05' }).paragraphs[0]).toContain('stopped on October 31, 2026')
  })

  it('lists what is included, in the person\'s own words', () => {
    expect(words().list).toEqual([
      'My newest bank statement',
      'A letter asking you to restore my Medi-Cal',
      'A request for a state hearing',
    ])
  })

  it('lists the signed statement, and says what comes later', () => {
    const letter = words({ statements: ['I do not have life insurance.'], later: ['Your newest bank statement'] })
    expect(letter.list).toContain('A signed statement about papers I do not have')
    expect(letter.after[0]).toBe('I am still looking for my newest bank statement. I will send it as soon as I can.')
  })

  it('has no worker name: a plain greeting', () => {
    const { worker_name: _name, ...facts } = input().facts
    expect(words({ facts }).greeting).toBe('Dear Medi-Cal worker,')
  })

  it('turns "your" into "my", but keeps "your letter"', () => {
    expect(inMyWords('The registration for each car you own')).toBe('The registration for each car I own')
    expect(inMyWords('The papers your letter says are missing')).toBe('The papers your letter says are missing')
    // From the Oct 20 run: the help examples were copied into the letter.
    expect(inMyWords('Proof of income, like a pay stub, or a Social Security or pension letter')).toBe('Proof of income')
  })

  it('writes dates in words', () => {
    expect(longDate('10/01/2026')).toBe('October 1, 2026')
    expect(longDate('2026-12-25')).toBe('December 25, 2026')
  })

  it('takes "Dear" and "Sincerely" off a drafted letter, since the letter adds its own', () => {
    expect(bodyOnly('Dear worker,\nPlease restore my Medi-Cal.\nSincerely,\nRosa')).toBe('Please restore my Medi-Cal.')
  })

  it('a renewal includes the filled-in form, pages 1 to 17', async () => {
    const renewal = { date_of_birth: '1953-03-14', household_change: 'no', social_security: 'yes', social_security_amount: '1240' }
    const bytes = await buildPacket(
      input({ letterType: 'MC210_RV', hearing: null, undoLetter: null, attachments: [], renewal, forms: { ...input().forms, renewalForm: form('mc210rv.pdf') } }),
      [],
      true,
    )
    // the cover letter, then the 17 pages of the form
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(18)
  })

  it('papers the person does not have get a signed statement page', async () => {
    const bytes = await buildPacket(input({ statements: ['I do not have a bank account.'] }), [], true)
    // cover, hearing request, restore letter, the statement, the attached photo
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(5)
  })

  it('a long letter goes on to a second page', async () => {
    const many = Array.from({ length: 30 }, (_, i) => `Paper number ${i + 1}`)
    const bytes = await buildPacket(input({ toSend: many, hearing: null, undoLetter: null, attachments: [] }), [], true)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2)
  })
})
