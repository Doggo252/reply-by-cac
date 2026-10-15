/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { check } from './checker'
import { buildPacket, hearingRequest, paperFactsFrom, printable, usDate, usPhone, type PacketInput } from './packet'

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
