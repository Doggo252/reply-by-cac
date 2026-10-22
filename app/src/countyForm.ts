// What the county already printed on the renewal form, read from a photo.
//
// The real MC 210 RV comes filled in with what the county has on file: each
// section has a "Review your ... information" box (Social Security, $1,190.00,
// Monthly) with "Is this correct? Yes / No" beside each line. So instead of
// asking everything from scratch, the app reads those lines and asks "Is this
// still right?" for each one. The person mostly taps Yes. (Neil's decision,
// Oct 21, after Mom's test showed the county's pages in the packet.)
//
// Everything here runs on the phone. The photo is only read, never saved.
import { money, type RenewalAnswers } from './renewalForm'
import { t } from './language'

export type CountySection = 'income' | 'resources' | 'medicare'

// One line the county printed.
export type OnFileRow = {
  section: CountySection
  kind: string // "Social Security", "Checking account", "Vehicle"; "Medicare" for Medicare
  details: string // the bank's name or the car (property only)
  amounts: string[] // the money on the line, in order: a car's worth then owed; Medicare's Part A, B, C, D
  often: string // "Monthly" (income only)
  correct?: boolean // the person's answer: is it still right?
}

// The pages with a "Review" box, in the order the app asks for them.
export const COUNTY_PAGES: { section: CountySection; page: number; title: string; heading: string }[] = [
  { section: 'income', page: 5, title: 'Income', heading: 'Review your income information' },
  { section: 'resources', page: 9, title: 'Resources and property', heading: 'Review your resources and property information' },
  { section: 'medicare', page: 11, title: 'Medicare coverage', heading: 'Review your Medicare information' },
]

// Where the paper the facts came from, for "Read from:" on the answers list.
export const COUNTY_PAPER = 'Your renewal form'

const HEADING: Record<CountySection, RegExp> = {
  income: /review\s+your\s+income/i,
  resources: /review\s+your\s+resources/i,
  medicare: /review\s+your\s+medicare/i,
}
const AMOUNT = /\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2}/g
const OFTEN = /\b(monthly|annually|yearly|weekly|daily|hourly|quarterly|every\s+2\s+weeks|twice\s+a\s+month)\b/i
// A line starts with a person's name: two words with capitals.
const NAME = /^[A-Z][A-Za-z'’-]+\s+[A-Z][A-Za-z'’-]+\s+/
// The "$ ☐ Yes ☐ No" line under each row (read as "$ OYes ONo").
const CHECKBOXES = /\bYes\b.*\bNo\b/i

// The kinds of income and property, and the words the form uses for them.
// The first match wins, so longer names come first.
const INCOME_KINDS: [RegExp, string][] = [
  [/social security|\bssa\b|oasdi/i, 'Social Security'],
  [/\bssi\b|supplemental security/i, 'SSI'],
  [/pension|retirement|annuit/i, 'Pension'],
  [/wages?|earnings|salary|employment/i, 'Earnings from work'],
  [/veteran|\bva\b/i, 'VA benefits'],
  [/interest|dividend/i, 'Interest'],
  [/rent/i, 'Rental income'],
  [/unemployment/i, 'Unemployment'],
  [/disability/i, 'Disability'],
]
const PROPERTY_KINDS: [RegExp, string][] = [
  [/checking/i, 'Checking account'],
  [/savings/i, 'Savings account'],
  [/credit union|bank/i, 'Bank account'],
  [/vehicle|\bcar\b|truck|auto/i, 'Vehicle'],
  [/life insurance/i, 'Life insurance'],
  [/burial/i, 'Burial fund'],
  [/real property|house|home|land/i, 'House or land'],
  [/\bira\b|\bcd\b|stock|bond|mutual fund/i, 'Investments'],
  [/cash/i, 'Cash'],
]

// Every word the app may show for a line's kind and how often (for spanish.test.ts).
export const COUNTY_WORDS = [
  ...[...INCOME_KINDS, ...PROPERTY_KINDS].map(([, name]) => name),
  ...['Monthly', 'Annually', 'Yearly', 'Weekly', 'Daily', 'Hourly', 'Quarterly', 'Every 2 weeks', 'Twice a month'],
  ...COUNTY_PAGES.map((page) => page.title),
  COUNTY_PAPER,
]

// The lines the county printed on one page, or none if the photo is not that
// page or nothing was printed.
export function readCountyPage(text: string, section: CountySection): OnFileRow[] {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/^[^A-Za-z0-9]+/, '').trim())
    .filter(Boolean)
  const start = lines.findIndex((line) => HEADING[section].test(line))
  if (start < 0) return []
  const rows: string[] = []
  let open = false // a row is still being read (a cell can wrap onto the next line)
  for (const line of lines.slice(start + 1)) {
    // The box ends at the bottom of the page or at the next section's title.
    // ("Then update or add below" inside the box's own heading does not count.)
    if (/continued on the next page|^update or add new/i.test(line)) break
    if (CHECKBOXES.test(line)) {
      open = false
      continue
    }
    if (NAME.test(line) && new RegExp(AMOUNT.source).test(line)) {
      rows.push(line)
      open = true
    } else if (open) {
      rows[rows.length - 1] += ` ${line}` // like "account" or "/ 0.00"
    }
  }
  return rows.map((row) => parseRow(row.replace(NAME, ''), section))
}

function parseRow(rest: string, section: CountySection): OnFileRow {
  const amounts = rest.match(AMOUNT) ?? []
  const often = OFTEN.exec(rest)?.[1] ?? ''
  if (section === 'medicare') return { section, kind: 'Medicare', details: '', amounts, often: '' }
  const kinds = section === 'income' ? INCOME_KINDS : PROPERTY_KINDS
  const found = kinds.find(([pattern]) => pattern.test(rest))
  // The words before the first amount: the kind, then the details.
  const words = rest.slice(0, rest.search(AMOUNT) < 0 ? undefined : rest.search(AMOUNT)).trim()
  const kindMatch = found ? found[0].exec(words) : null
  const details = section === 'resources' && kindMatch ? words.slice(kindMatch.index + kindMatch[0].length).replace(/^\s*account\b/i, '').trim() : ''
  return { section, kind: found ? found[1] : words, details, amounts, often: often ? capital(often) : '' }
}

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()

// Medicare's amounts by part. One amount is taken as Part B: it is the
// premium most people pay, and Part A is usually free.
export function medicareParts(row: OnFileRow): { a?: string; b?: string; c?: string; d?: string } {
  const [first, second, third, fourth] = row.amounts
  if (row.amounts.length === 1) return { b: first }
  return { a: first, b: second, c: third, d: fourth }
}

// One line in plain words, for "The county has: ...".
export function rowWords(row: OnFileRow): string {
  if (row.section === 'medicare') {
    const parts = medicareParts(row)
    const listed = (['a', 'b', 'c', 'd'] as const)
      .filter((part) => parts[part] && Number(parts[part]!.replace(/,/g, '')) > 0)
      .map((part) => t('Part {part}: ${amount} a month', { part: part.toUpperCase(), amount: money(parts[part]) }))
    return listed.length ? listed.join(', ') : t('Medicare, no premiums listed')
  }
  const kind = t(row.kind)
  if (row.section === 'income') {
    const amount = row.amounts[0] ? `$${money(row.amounts[0])}` : ''
    return [kind, amount, row.often ? t(row.often) : ''].filter(Boolean).join(', ')
  }
  const worth = row.amounts[0] ? `$${money(row.amounts[0])}` : ''
  const owed = row.kind === 'Vehicle' && row.amounts[1] ? t('owe ${amount}', { amount: money(row.amounts[1]) }) : ''
  return [kind, row.details, worth, owed].filter(Boolean).join(', ')
}

// The renewal answers a checked line gives. A line that is still right
// answers its questions, so they are not asked again. A line that changed only
// says the person still has it ("Do you get Social Security?" yes); the
// questions then ask for the new amount.
export function answersFromRows(rows: OnFileRow[]): RenewalAnswers {
  const answers: RenewalAnswers = {}
  for (const row of rows) {
    const ok = row.correct === true
    const amount = row.amounts[0] ? money(row.amounts[0]) : ''
    if (row.section === 'income') {
      const [yesId, amountId] =
        row.kind === 'Social Security'
          ? ['social_security', 'social_security_amount']
          : row.kind === 'Pension'
            ? ['pension', 'pension_amount']
            : row.kind === 'Earnings from work'
              ? ['job', 'job_amount']
              : ['other_income', 'other_income_amount']
      answers[yesId] = 'yes'
      if (yesId === 'other_income') answers.other_income_source = row.kind
      if (ok && amount) answers[amountId] = amount
    } else if (row.section === 'resources') {
      if (/account/.test(row.kind)) {
        answers.bank = 'yes'
        if (row.details) answers.bank_name = row.details
        if (ok && amount) answers.bank_balance = amount
      } else if (row.kind === 'Vehicle') {
        answers.car = 'yes'
        if (row.details) answers.car_make = row.details
        if (ok && amount) {
          answers.car_worth = amount
          answers.car_owe = row.amounts[1] ? money(row.amounts[1]) : '0.00'
        }
      } else if (row.kind === 'Life insurance') {
        answers.life_insurance = 'yes'
        if (row.details) answers.life_insurance_company = row.details
        if (ok && amount) answers.life_insurance_value = amount
      } else if (row.kind === 'House or land') {
        answers.other_property = 'yes'
        if (ok) answers.other_property_details = [row.details, amount && `$${amount}`].filter(Boolean).join(', ')
      }
    } else {
      answers.medicare = 'yes'
      if (ok) {
        const parts = medicareParts(row)
        if (parts.b) answers.medicare_part_b_premium = money(parts.b)
        const d = parts.d && Number(parts.d.replace(/,/g, '')) > 0 ? money(parts.d) : ''
        answers.part_d = d ? 'yes' : 'no'
        if (d) answers.part_d_premium = d
      }
    }
  }
  return answers
}

// The checked lines are saved with the other renewal answers, as text.
export const ON_FILE = 'on_file'
export function onFileRows(answers: RenewalAnswers): OnFileRow[] {
  try {
    const rows = JSON.parse(answers[ON_FILE] ?? '[]')
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}
