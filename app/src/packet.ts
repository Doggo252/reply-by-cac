// Builds the reply packet: one PDF the person prints, mails, faxes, or brings
// to the county office.
//
//   page 1   a cover letter, like one a person would write: their address,
//            the date, the county, what it is about, a few plain sentences,
//            what is included, their signature, and a list of the pages
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
import { fillRenewalForm, type RenewalAnswers } from './renewalForm'

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
  toSend?: string[] // the papers going in the envelope, listed in the cover letter
  statements?: string[] // "I do not have life insurance." and the like, for the cover letter
  later?: string[] // papers the person will send when they find them
  renewal?: RenewalAnswers // the renewal form's answers, when the reply includes the filled-in form
  attachments: Attachment[]
  signature: Uint8Array | null // PNG of the signature
  forms: { hearingRequest?: Uint8Array; renewalSignaturePage?: Uint8Array; renewalForm?: Uint8Array }
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// "10/01/2026" or "2026-10-01" becomes "2026-10-01". Anything else stays as it is.
function isoDate(value: string | undefined): string {
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? '')
  return us ? `${us[3]}-${us[1]}-${us[2]}` : (value ?? '')
}

// "10/01/2026" or "2026-10-01" becomes "October 1, 2026", the way a letter writes it.
export function longDate(value: string | undefined): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate(value))
  if (!iso) return value ?? ''
  return `${MONTHS[Number(iso[2]) - 1]} ${Number(iso[3])}, ${iso[1]}`
}

// The papers lists talk to the person ("Your newest bank statement"). The
// letter is from them, so it says "My newest bank statement". ("Your letter"
// stays: that is the county's letter.) The examples that help the person
// ("Proof of income, like a pay stub, ...") don't belong in a letter.
export function inMyWords(item: string): string {
  return item
    .replace(/, like .*$/, '')
    .replace(/\bYour\b(?! letter)/g, 'My')
    .replace(/\byour\b(?! letter)/g, 'my')
    .replace(/\byou\b/g, 'I')
}

// "a", "a and b", "a, b and c".
const joinAnd = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

export type CoverLetter = {
  from: string[] // the person's name and address, at the top
  date: string
  to: string[]
  re: string // what the letter is about
  greeting: string
  paragraphs: string[]
  list: string[] // what is in the envelope, after "I am including:"
  after: string[] // the paragraphs after the list
  closing: string
  name: string // under the signature
}

export type CoverLetterInput = Pick<PacketInput, 'letterType' | 'about' | 'facts' | 'today' | 'toSend' | 'statements' | 'later'> & {
  hearing: boolean // a hearing request is in the envelope
  undoLetter: boolean // the letter asking to restore Medi-Cal is in the envelope
}

// The words of the cover letter, from the person, in plain English. The same
// words show on "Look over your reply" (ReplyPreview.tsx), so the person reads
// exactly what will be printed.
export function coverLetter(input: CoverLetterInput): CoverLetter {
  const { about, facts: f } = input
  const notice = longDate(f.notice_date)
  const dated = notice ? ` dated ${notice}` : ''

  const paragraphs: string[] = []
  if (input.letterType === 'MC_239A') {
    const stop = longDate(f.effective_date)
    const when = !f.effective_date ? 'is stopping' : isoDate(f.effective_date) <= input.today ? `stopped on ${stop}` : `will stop on ${stop}`
    paragraphs.push(
      `I got your letter${dated}. It says my Medi-Cal ${when} because you did not get some information from me. ` +
        'I am sending that information with this letter.',
      'The law gives me 90 days to send it (W&IC 14005.37). Please restore my Medi-Cal back to the date it stopped, ' +
        'without a new application.',
    )
  } else if (input.letterType === 'MC355') {
    paragraphs.push(`I got your Request for Information${dated}. I am sending the papers you asked for with this letter.`)
  } else if (input.letterType === 'MC210_RV') {
    paragraphs.push(`I got my Medi-Cal renewal packet${notice ? ` with your letter${dated}` : ''}. I am sending back my renewal form with this letter.`)
  } else {
    paragraphs.push(`I am writing about your letter${dated}.`)
  }

  const list = [
    ...(input.toSend ?? []).map(inMyWords),
    ...(input.statements?.length ? ['A signed statement about papers I do not have'] : []),
    ...(input.undoLetter ? ['A letter asking you to restore my Medi-Cal'] : []),
    ...(input.hearing ? ['A request for a state hearing'] : []),
  ]

  const after: string[] = []
  if (input.later?.length) {
    // "Retirement account statement" reads as "my retirement account statement".
    const items = input.later
      .map((item) => inMyWords(item).replace(/^./, (c) => c.toLowerCase()))
      .map((item) => (/^(my|a|an|the|proof|papers|each|any|statements)\b/.test(item) ? item : `my ${item}`))
    after.push(`I am still looking for ${joinAnd(items)}. I will send ${items.length === 1 ? 'it' : 'them'} as soon as I can.`)
  }
  const phone = usPhone(about.phone)
  after.push(phone ? `If you need anything else, please call me at ${phone}. Thank you for your help.` : 'Thank you for your help.')

  const subject = [f.case_number && `case number ${f.case_number}`, notice && `your letter dated ${notice}`].filter(Boolean).join(', ')
  return {
    from: [about.name, about.street, `${about.city}, CA ${about.zip}`, ...(phone ? [phone] : [])],
    date: longDate(input.today),
    to: [`${about.county} County Medi-Cal`, ...(f.worker_name ? [`Attn: ${f.worker_name}`] : [])],
    re: subject ? `Re: ${subject.charAt(0).toUpperCase()}${subject.slice(1)}` : 'Re: My Medi-Cal',
    greeting: f.worker_name ? `Dear ${f.worker_name},` : 'Dear Medi-Cal worker,',
    paragraphs,
    list,
    after,
    closing: 'Sincerely,',
    name: about.name,
  }
}

// A drafted letter may already start with "Dear ..." or end with
// "Sincerely, ...". Our letter adds those itself, so they are taken off.
export function bodyOnly(text: string): string {
  const lines = text.trim().split('\n')
  if (/^dear\b/i.test(lines[0] ?? '')) lines.shift()
  const end = lines.findIndex((line) => /^(sincerely|respectfully|regards|best regards)\b/i.test(line.trim()))
  return (end >= 0 ? lines.slice(0, end) : lines).join('\n').trim()
}

// One piece of a letter, before it is put on a page.
type Block = { text: string; bold?: boolean; size?: number; gap?: number; bullet?: boolean } | { signature: true; gap?: number }

const SIGNATURE_HEIGHT = 40
const RENEWAL_PAGES = 17 // the MC 210 RV pages that go back to the county

// Puts the blocks on pages, top to bottom, starting a new page when one is
// full. Returns where each line goes (page, x, y), and how many pages it took.
function placeBlocks(blocks: Block[], fonts: Fonts) {
  const top = LETTER[1] - MARGIN
  const bottom = MARGIN + 20 // room for the page footer
  const width = LETTER[0] - 2 * MARGIN
  const placed: { page: number; x: number; y: number; text?: string; font?: PDFFont; size?: number }[] = []
  let page = 0
  let y = top
  const room = (height: number) => {
    if (y - height < bottom) {
      page++
      y = top
    }
  }
  for (const block of blocks) {
    if (y < top) y -= block.gap ?? 0 // no extra space at the top of a page
    if ('signature' in block) {
      room(SIGNATURE_HEIGHT)
      y -= SIGNATURE_HEIGHT
      placed.push({ page, x: MARGIN, y })
      continue
    }
    const size = block.size ?? 11
    const font = block.bold ? fonts.bold : fonts.regular
    const indent = block.bullet ? 18 : 0
    wrap(block.text, font, size, width - indent).forEach((line, i) => {
      room(size * 1.4)
      y -= size * 1.4
      if (block.bullet && i === 0) placed.push({ page, x: MARGIN + 4, y, text: '•', font: fonts.regular, size })
      placed.push({ page, x: MARGIN + indent, y, text: line, font, size })
    })
  }
  return { placed, pages: page + 1 }
}

// Draws placed blocks onto pages. A line with no text is the signature.
function drawPlaced(pages: PDFPage[], placed: ReturnType<typeof placeBlocks>['placed'], sign: (page: PDFPage, x: number, y: number) => void) {
  for (const p of placed) {
    if (p.text === undefined) sign(pages[p.page], p.x, p.y)
    else pages[p.page].drawText(p.text, { x: p.x, y: p.y, size: p.size, font: p.font, color: INK })
  }
}

// The top of any letter from the person: their address, the date, who it is
// to, and what it is about.
function letterTop(from: string[], date: string, to: string[], re: string, greeting: string): Block[] {
  return [
    ...from.map((text) => ({ text })),
    { text: date, gap: 16 },
    ...to.map((text, i) => ({ text, gap: i === 0 ? 16 : 0 })),
    { text: re, bold: true, gap: 16 },
    { text: greeting, gap: 16 },
  ]
}

// What each letter type's packet is called, for the PDF's title.
const PACKET_TITLES: Record<string, string> = {
  MC_239A: 'Response to Notice of Action (Medi-Cal discontinuance)',
  MC355: 'Response to Request for Information (MC 355)',
  MC210_RV: 'Medi-Cal renewal (MC 210 RV) and proof',
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
  const sign = (page: PDFPage, x: number, y: number, maxWidth = 200, maxHeight = SIGNATURE_HEIGHT) => {
    if (!signature) return
    const scale = Math.min(maxWidth / signature.width, maxHeight / signature.height)
    page.drawImage(signature, { x, y, width: signature.width * scale, height: signature.height * scale })
  }
  const { about } = input
  const f = input.facts

  // What is in the packet after the cover letter: [what it is, how many pages].
  const contents: [string, number][] = []
  // Official form pages have their own fine print at the bottom, so they get no footer.
  const formPages: PDFPage[] = []

  if (input.letterType === 'MC_239A' && input.hearing) {
    const { doc, overflow } = await hearingRequest(input, fonts)
    const page = await formPage(packet, doc)
    formPages.push(page)
    // The signature box on the NA Back 9, beside the date.
    sign(page, 320, 168, 165, 16)
    contents.push(['Request for a state hearing (form NA Back 9)', 1])
    if (overflow) {
      const extra = packet.addPage([...LETTER])
      writePage(extra, fonts, "Hearing request: Here's why (continued)", [overflow, `${about.name}, ${usDate(input.today)}`])
      contents.push(["Hearing request: Here's why (continued)", 1])
    }
  }

  // The letter asking the county to restore Medi-Cal, laid out like the cover letter.
  if (input.letterType === 'MC_239A' && input.undoLetter) {
    const blocks: Block[] = [
      ...letterTop(
        coverLetter({ ...input, hearing: false, undoLetter: false }).from,
        longDate(input.today),
        [`${about.county} County Medi-Cal`, ...(f.worker_name ? [`Attn: ${f.worker_name}`] : [])],
        `Re: Please restore my Medi-Cal${f.case_number ? `, case number ${f.case_number}` : ''}`,
        f.worker_name ? `Dear ${f.worker_name},` : 'Dear Medi-Cal worker,',
      ),
      ...bodyOnly(input.undoLetter).split(/\n\s*\n/).map((text) => ({ text: text.replace(/\n/g, ' '), gap: 10 })),
      { text: 'Sincerely,', gap: 16 },
      { signature: true, gap: 4 },
      { text: about.name, gap: 2 },
    ]
    const { placed, pages } = placeBlocks(blocks, fonts)
    const added = Array.from({ length: pages }, () => packet.addPage([...LETTER]))
    drawPlaced(added, placed, sign)
    contents.push(['Letter asking you to restore my Medi-Cal', pages])
  }

  // The renewal form, filled in from the person's answers: pages 1 to 17 (the
  // pages after 17 are "keep for your records"), signed on page 17.
  if (input.renewal && input.forms.renewalForm) {
    const filled = await fillRenewalForm(input.forms.renewalForm, { answers: input.renewal, about, facts: f, today: input.today })
    filled.getForm().flatten()
    const embedded = await packet.embedPdf(await filled.save(), Array.from({ length: RENEWAL_PAGES }, (_, i) => i))
    embedded.forEach((form, i) => {
      const page = packet.addPage([form.width, form.height])
      page.drawPage(form)
      formPages.push(page)
      if (i === RENEWAL_PAGES - 1) sign(page, 92, 400, 300, 34)
    })
    contents.push(['My renewal form (MC 210 RV), filled in and signed', RENEWAL_PAGES])
  } else if (input.letterType === 'MC210_RV') {
    if (!input.forms.renewalSignaturePage) throw new Error('The renewal signature page is missing.')
    const source = await PDFDocument.load(input.forms.renewalSignaturePage)
    const form = source.getForm()
    form.getTextField('sig_date').setText(usDate(input.today))
    const page = await formPage(packet, source)
    formPages.push(page)
    sign(page, 92, 400, 300, 34)
    contents.push(['My signed renewal page (MC 210 RV, page 17)', 1])
  }

  // A signed statement for the papers the person does not have, laid out like the cover letter.
  if (input.statements?.length) {
    const blocks: Block[] = [
      ...letterTop(
        coverLetter({ ...input, hearing: false, undoLetter: false }).from,
        longDate(input.today),
        [`${about.county} County Medi-Cal`, ...(f.worker_name ? [`Attn: ${f.worker_name}`] : [])],
        `Re: Papers I do not have${f.case_number ? `, case number ${f.case_number}` : ''}`,
        f.worker_name ? `Dear ${f.worker_name},` : 'Dear Medi-Cal worker,',
      ),
      { text: 'About the papers you asked for:', gap: 10 },
      ...input.statements.map((text, i) => ({ text, bullet: true, gap: i === 0 ? 4 : 2 })),
      { text: 'I declare that this is true and correct.', gap: 10 },
      { text: 'Sincerely,', gap: 16 },
      { signature: true, gap: 4 },
      { text: about.name, gap: 2 },
    ]
    const { placed, pages } = placeBlocks(blocks, fonts)
    const added = Array.from({ length: pages }, () => packet.addPage([...LETTER]))
    drawPlaced(added, placed, sign)
    contents.push(['My signed statement about papers I do not have', pages])
  }

  for (const file of input.attachments) {
    const what = `${file.type === 'application/pdf' ? 'Copy' : 'Photo'}: ${inMyWords(file.name)}`
    contents.push([what, await attachmentPages(packet, file, fonts)])
  }

  // The cover letter goes first. Its list of pages counts the letter itself,
  // so it is laid out once to see how many pages the letter takes.
  const words = coverLetter({ ...input, hearing: !!input.hearing && input.letterType === 'MC_239A', undoLetter: !!input.undoLetter && input.letterType === 'MC_239A' })
  const letterBlocks = (letterPages: number): Block[] => {
    let next = letterPages + 1
    const index = contents.map(([what, count]) => {
      const where = count === 1 ? `Page ${next}` : `Pages ${next}-${next + count - 1}`
      next += count
      return `${where}: ${what}`
    })
    const total = next - 1
    return [
      ...letterTop(words.from, words.date, words.to, words.re, words.greeting),
      ...words.paragraphs.map((text) => ({ text, gap: 10 })),
      ...(words.list.length ? [{ text: 'I am including:', gap: 10 }] : []),
      ...words.list.map((text, i) => ({ text, bullet: true, gap: i === 0 ? 4 : 2 })),
      ...words.after.map((text) => ({ text, gap: 10 })),
      { text: words.closing, gap: 16 },
      { signature: true, gap: 4 },
      { text: words.name, gap: 2 },
      { text: `Enclosures (${total} ${total === 1 ? 'page' : 'pages'} in all)`, bold: true, size: 9, gap: 24 },
      { text: letterPages === 1 ? 'Page 1: This letter' : `Pages 1-${letterPages}: This letter`, size: 9, gap: 2 },
      ...index.map((text) => ({ text, size: 9 })),
    ]
  }
  let letterPages = placeBlocks(letterBlocks(1), fonts).pages
  if (letterPages > 1) letterPages = placeBlocks(letterBlocks(letterPages), fonts).pages
  const { placed } = placeBlocks(letterBlocks(letterPages), fonts)
  const coverPages = Array.from({ length: letterPages }, (_, i) => packet.insertPage(i, [...LETTER]))
  drawPlaced(coverPages, placed, sign)

  // A small line at the bottom of each page the app made, so pages that come
  // apart can be put back together.
  const all = packet.getPages()
  all.forEach((page, i) => {
    if (formPages.includes(page)) return
    const text = printable(
      [about.name, f.case_number && `Case number ${f.case_number}`, `Page ${i + 1} of ${all.length}`].filter(Boolean).join('  |  '),
    )
    const width = fonts.regular.widthOfTextAtSize(text, 8)
    page.drawText(text, { x: (page.getWidth() - width) / 2, y: 18, size: 8, font: fonts.regular, color: rgb(0.35, 0.35, 0.35) })
  })

  return packet.save()
}
