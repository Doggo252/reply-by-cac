// Builds the reply packet: one PDF the person prints, mails, faxes, or brings
// to the county office.
//
//   page 1   cover sheet: who, case number, the letter, and a page list
//   then     the filled forms for this letter
//            (hearing request on the official NA Back 9, the letter asking
//            the county to undo the stop, or the MC 210 RV signature page)
//   then     the papers the person chose from their vault
//
// Everything happens on the phone with pdf-lib. The official forms are in
// app/public/forms. These functions take the form files as bytes, so the
// tests can run them without a browser.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Mismatch } from './checker'

// Facts written on the papers, as the person reviewed them. Written the way
// American forms write them: 10/01/2026 and (408) 555-0123.
export type PaperFacts = Record<string, string>

export type AboutYou = {
  name: string
  phone: string
  street: string
  city: string
  zip: string
  county: 'Santa Clara' | 'San Mateo'
}

export type Attachment = { name: string; type: string; bytes: Uint8Array }

export type PacketInput = {
  letterType: string
  about: AboutYou
  facts: PaperFacts
  today: string // YYYY-MM-DD
  hearing: { reason: string } | null // MC 239 A: ask for a hearing
  undoLetter: string | null // MC 239 A: the letter asking to undo the stop
  toSend?: string[] // what the county asked for, as a checklist on the cover sheet
  statements?: string[] // "I do not have life insurance." and the like, for the cover letter
  attachments: Attachment[]
  signature: Uint8Array | null // PNG of the signature
  forms: { hearingRequest?: Uint8Array; renewalSignaturePage?: Uint8Array }
}

// The two things that must be true before a final packet is made. The agent's
// locked tool (Neil's agent/TOOLS.md) checks the same two.
export function packetProblems(mismatches: Mismatch[], signature: Uint8Array | null): string[] {
  const problems: string[] = []
  if (mismatches.length > 0) problems.push('The papers do not match the letter yet.')
  if (!signature) problems.push('The papers are not signed yet.')
  return problems
}

// "2026-10-01" becomes "10/01/2026".
export const usDate = (iso: string | null | undefined) =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : (iso ?? '')

// "4085550123" becomes "(408) 555-0123".
export function usPhone(text: string | null | undefined): string {
  const digits = (text ?? '').replace(/\D/g, '')
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : (text ?? '')
}

// The facts that go on the papers, from the facts the person confirmed.
export function paperFactsFrom(facts: Record<string, string | null>): PaperFacts {
  const out: PaperFacts = {}
  for (const [field, value] of Object.entries(facts)) {
    if (value === null || field === 'ask') continue
    out[field] = field.endsWith('_date') ? usDate(value) : field.endsWith('_phone') ? usPhone(value) : value
  }
  return out
}

// The standard PDF font can only write Western European letters. Swap the
// common look-alikes, and anything else becomes "?" instead of crashing.
export function printable(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '?')
}

// Splits text into lines that fit a width.
export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of printable(text).split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(tryLine, size) <= width || !line) line = tryLine
      else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

const LETTER = [612, 792] as const // US letter, in points
const MARGIN = 60
const INK = rgb(0.1, 0.1, 0.1)

// A plain page with a title and wrapped text. Returns the y where it ended.
function writePage(page: PDFPage, fonts: Fonts, title: string, blocks: string[], startY = LETTER[1] - MARGIN): number {
  let y = startY
  page.drawText(printable(title), { x: MARGIN, y, size: 16, font: fonts.bold, color: INK })
  y -= 28
  for (const block of blocks) {
    for (const line of wrap(block, fonts.regular, 11, LETTER[0] - 2 * MARGIN)) {
      page.drawText(line, { x: MARGIN, y, size: 11, font: fonts.regular, color: INK })
      y -= 15
    }
    y -= 8
  }
  return y
}

type Fonts = { regular: PDFFont; bold: PDFFont }

// Flattens a filled form (the answers become part of the page, so they cannot
// be changed) and draws it onto a new page of the packet. Drawing it, instead
// of copying the page, leaves behind the form's fields, which point at parts
// that flattening removed.
async function formPage(packet: PDFDocument, filled: PDFDocument): Promise<PDFPage> {
  filled.getForm().flatten()
  const [embedded] = await packet.embedPdf(await filled.save(), [0])
  const page = packet.addPage([embedded.width, embedded.height])
  page.drawPage(embedded)
  return page
}

// The official hearing request (the NA Back 9), filled in.
export async function hearingRequest(input: PacketInput, fonts: Fonts): Promise<{ doc: PDFDocument; overflow: string | null }> {
  if (!input.forms.hearingRequest) throw new Error('The hearing request form is missing.')
  const doc = await PDFDocument.load(input.forms.hearingRequest)
  const form = doc.getForm()
  // Fonts belong to one PDF file, so the form gets its own copy.
  const formFont = await doc.embedFont(StandardFonts.Helvetica)
  const { about } = input
  const set = (name: string, value: string) => form.getTextField(name).setText(printable(value))

  set('Dept of', about.county)
  form.getCheckBox('Med').check()
  set('Name', about.name)
  set('Phone Number', about.phone)
  set('Street Address', about.street)
  set('City', about.city)
  set('State', 'CA')
  set('Zip code', about.zip)
  set('Person Completing', about.name)
  set('Phone Number2', about.phone)
  set('Date Sign1', usDate(input.today))

  // "Here's why": six short lines on the form. If it does not fit, the form
  // says to check the box and add a page, so that is what happens.
  const reasonFields = ['Herte is why', 'Herte is why2', 'Herte is why3', 'Herte is why4', 'Herte is why5', 'Herte is why6']
  const widths = [215, 268, 268, 268, 268, 268]
  const words = printable(input.hearing?.reason ?? '').split(/\s+/).filter(Boolean)
  let overflow: string | null = null
  reasonFields.forEach((field, i) => {
    let line = ''
    while (words.length && fonts.regular.widthOfTextAtSize(`${line} ${words[0]}`.trim(), 9) <= widths[i]) {
      line = `${line} ${words.shift()}`.trim()
    }
    set(field, line)
  })
  if (words.length) {
    form.getCheckBox('Check Here').check()
    overflow = input.hearing?.reason ?? ''
  }
  for (const field of reasonFields) form.getTextField(field).setFontSize(9)
  form.updateFieldAppearances(formFont)
  return { doc, overflow }
}

async function attachmentPages(packet: PDFDocument, file: Attachment, fonts: Fonts): Promise<number> {
  try {
    if (file.type === 'application/pdf') {
      const source = await PDFDocument.load(file.bytes, { ignoreEncryption: true })
      const pages = await packet.embedPdf(source, source.getPageIndices())
      for (const embedded of pages) packet.addPage([embedded.width, embedded.height]).drawPage(embedded)
      return pages.length
    }
    const image = file.type === 'image/png' ? await packet.embedPng(file.bytes) : await packet.embedJpg(file.bytes)
    const page = packet.addPage([...LETTER])
    const scale = Math.min((LETTER[0] - 2 * 36) / image.width, (LETTER[1] - 2 * 36) / image.height)
    const width = image.width * scale
    const height = image.height * scale
    page.drawImage(image, { x: (LETTER[0] - width) / 2, y: (LETTER[1] - height) / 2, width, height })
    return 1
  } catch {
    // A file pdf-lib cannot read still gets a page, so the list stays honest.
    const page = packet.addPage([...LETTER])
    writePage(page, fonts, `Attachment: ${file.name}`, ['This file could not be added here. Please print it and send it too.'])
    return 1
  }
}

// A few plain sentences to the county at the top of the cover sheet, in the
// person's own voice, saying what this envelope is.
export function coverNote(letterType: string, noticeDate: string | undefined): string {
  const letter = noticeDate ? `your letter dated ${noticeDate}` : 'your letter'
  if (letterType === 'MC_239A') {
    return (
      `I am sending the information you asked for in ${letter}. The law gives me 90 days to send it ` +
      '(W&IC 14005.37). Please restore my Medi-Cal back to the date it stopped, without a new application.'
    )
  }
  if (letterType === 'MC355') return `I am sending the information you asked for in ${letter}.`
  return `I am sending my Medi-Cal renewal, as asked in ${letter}. My signed page and my proof are included.`
}

// What each letter type's packet is called, for the cover sheet.
const PACKET_TITLES: Record<string, string> = {
  MC_239A: 'Response to Notice of Action (Medi-Cal discontinuance)',
  MC355: 'Response to Request for Information (MC 355)',
  MC210_RV: 'Medi-Cal renewal (MC 210 RV): signature page and proof',
}

// Builds the packet. With `final`, it refuses unless the checker passed and
// the person signed. Without it, it makes an unsigned preview.
export async function buildPacket(input: PacketInput, mismatches: Mismatch[], final: boolean): Promise<Uint8Array> {
  if (final) {
    const problems = packetProblems(mismatches, input.signature)
    if (problems.length) throw new Error(problems.join(' '))
  }
  const packet = await PDFDocument.create()
  packet.setTitle(PACKET_TITLES[input.letterType] ?? 'Medi-Cal response')
  const fonts = {
    regular: await packet.embedFont(StandardFonts.Helvetica),
    bold: await packet.embedFont(StandardFonts.HelveticaBold),
  }
  const signature = input.signature ? await packet.embedPng(input.signature) : null
  const sign = (page: PDFPage, x: number, y: number, maxWidth: number, maxHeight: number) => {
    if (!signature) return
    const scale = Math.min(maxWidth / signature.width, maxHeight / signature.height)
    page.drawImage(signature, { x, y, width: signature.width * scale, height: signature.height * scale })
  }

  // The page list for the cover sheet: [what it is, how many pages].
  const contents: [string, number][] = []
  // Whether a form page got the signature (if not, the cover sheet gets it).
  let signedAPage = false

  if (input.letterType === 'MC_239A' && input.hearing) {
    const { doc, overflow } = await hearingRequest(input, fonts)
    const page = await formPage(packet, doc)
    // The signature box on the NA Back 9, beside the date.
    sign(page, 320, 168, 165, 16)
    signedAPage = true
    contents.push(['Request for a state hearing (NA Back 9)', 1])
    if (overflow) {
      const extra = packet.addPage([...LETTER])
      writePage(extra, fonts, "Hearing request: Here's why (continued)", [overflow, `${input.about.name}, ${usDate(input.today)}`])
      contents.push(["Hearing request: Here's why (continued)", 1])
    }
  }

  if (input.letterType === 'MC_239A' && input.undoLetter) {
    const page = packet.addPage([...LETTER])
    const y = writePage(page, fonts, 'Request to restore my Medi-Cal', [
      `To: ${input.about.county} County, Medi-Cal`,
      `From: ${input.about.name}, ${input.about.street}, ${input.about.city}, CA ${input.about.zip}`,
      `Case number: ${input.facts.case_number ?? ''}`,
      `Date: ${usDate(input.today)}`,
      input.undoLetter,
    ])
    page.drawText('Signature:', { x: MARGIN, y: y - 20, size: 11, font: fonts.regular, color: INK })
    sign(page, MARGIN + 70, y - 28, 200, 40)
    signedAPage = true
    contents.push(['Letter asking the county to restore my Medi-Cal', 1])
  }

  if (input.letterType === 'MC210_RV') {
    if (!input.forms.renewalSignaturePage) throw new Error('The renewal signature page is missing.')
    const source = await PDFDocument.load(input.forms.renewalSignaturePage)
    const form = source.getForm()
    form.getTextField('sig_date').setText(usDate(input.today))
    const page = await formPage(packet, source)
    sign(page, 92, 400, 300, 34)
    signedAPage = true
    contents.push(['MC 210 RV page 17: declaration and signature', 1])
  }

  for (const file of input.attachments) {
    contents.push([`Attached: ${printable(file.name)}`, await attachmentPages(packet, file, fonts)])
  }

  // The cover sheet goes first, with page numbers that count itself.
  const cover = packet.insertPage(0, [...LETTER])
  const f = input.facts
  const lines = [
    `To: ${input.about.county} County, Medi-Cal`,
    `From: ${input.about.name}`,
    `${input.about.street}, ${input.about.city}, CA ${input.about.zip}`,
    `Phone: ${input.about.phone}`,
    `Case number: ${f.case_number ?? ''}`,
    `About the letter dated: ${f.notice_date ?? ''}`,
    ...(f.due_date ? [`Due date on the letter: ${f.due_date}`] : []),
    ...(f.effective_date ? [`Date coverage stops on the letter: ${f.effective_date}`] : []),
    ...(f.worker_name || f.worker_phone ? [`Worker: ${[f.worker_name, f.worker_phone].filter(Boolean).join(', ')}`] : []),
    `Sent: ${usDate(input.today)}`,
  ]
  let y = writePage(cover, fonts, PACKET_TITLES[input.letterType] ?? 'Medi-Cal response', [
    ...lines,
    [coverNote(input.letterType, f.notice_date), ...(input.statements ?? [])].join(' '),
  ])

  // The papers the county asked for, with a box to tick for each one put in
  // the envelope (photos are attached; paper copies can go in by hand).
  if (input.toSend?.length) {
    cover.drawText('The papers you asked for (tick each one included)', { x: MARGIN, y: y - 6, size: 13, font: fonts.bold, color: INK })
    y -= 28
    for (const item of input.toSend) {
      for (const [i, line] of wrap(item, fonts.regular, 11, LETTER[0] - 2 * MARGIN - 24).entries()) {
        if (i === 0) cover.drawText('[  ]', { x: MARGIN, y, size: 11, font: fonts.regular, color: INK })
        cover.drawText(line, { x: MARGIN + 24, y, size: 11, font: fonts.regular, color: INK })
        y -= 15
      }
    }
    y -= 10
  }

  cover.drawText('What is in this packet', { x: MARGIN, y: y - 6, size: 13, font: fonts.bold, color: INK })
  y -= 28
  let pageNumber = 2
  const index = [['Cover sheet', 'page 1'], ...contents.map(([what, count]) => {
    const pages = count === 1 ? `page ${pageNumber}` : `pages ${pageNumber}-${pageNumber + count - 1}`
    pageNumber += count
    return [what, pages]
  })]
  for (const [what, pages] of index) {
    cover.drawText(printable(`${what}`), { x: MARGIN, y, size: 11, font: fonts.regular, color: INK })
    cover.drawText(pages, { x: LETTER[0] - MARGIN - 70, y, size: 11, font: fonts.regular, color: INK })
    y -= 16
  }
  const total = pageNumber - 1
  cover.drawText(`Total: ${total} ${total === 1 ? 'page' : 'pages'}`, { x: MARGIN, y: y - 6, size: 11, font: fonts.bold, color: INK })
  // When no form in the packet has a place to sign, the cover sheet does.
  if (!signedAPage) {
    cover.drawText('Signature:', { x: MARGIN, y: y - 50, size: 11, font: fonts.regular, color: INK })
    sign(cover, MARGIN + 70, y - 58, 200, 40)
  }
  cover.drawText(printable(`Please write the case number (${f.case_number ?? ''}) on anything that comes apart.`), {
    x: MARGIN, y: MARGIN, size: 9, font: fonts.regular, color: INK,
  })

  return packet.save()
}
