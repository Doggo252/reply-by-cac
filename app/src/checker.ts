// Neil's form checker (core/checker.py), on the phone.
//
// Before anything is signed, the filled form is compared to the facts the
// user confirmed. Any field that does not match is listed, and signing waits
// until the list is empty. This is a line-by-line copy of Neil's Python, so
// it runs with no internet; the test checks it against answers his own code
// gave (fixtures/checker_cases.json).

export type Mismatch = { field: string; form: string | null; fact: string }

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

// The pieces Python's strptime matches for %Y, %m, %d and %B, so the dates
// it accepts are exactly the ones Neil's code accepts.
const YEAR = '(\\d\\d\\d\\d)'
const MONTH = '(1[0-2]|0[1-9]|[1-9])'
const DAY = '(3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])'
const MONTH_NAME = `(${MONTHS.join('|')})`

// Neil's FORMATS list, in the same order: [pattern, which group is what].
const FORMATS: [RegExp, 'ymd' | 'mdy' | 'Bdy'][] = [
  [`${YEAR}-${MONTH}-${DAY}`, 'ymd'],
  [`${MONTH}/${DAY}/${YEAR}`, 'mdy'],
  [`${MONTH_NAME}\\s+${DAY},\\s+${YEAR}`, 'Bdy'],
  [`${MONTH}-${DAY}-${YEAR}`, 'mdy'],
  [`${MONTH_NAME}\\s+${DAY}st,\\s+${YEAR}`, 'Bdy'],
  [`${MONTH_NAME}\\s+${DAY}nd,\\s+${YEAR}`, 'Bdy'],
  [`${MONTH_NAME}\\s+${DAY}rd,\\s+${YEAR}`, 'Bdy'],
  [`${MONTH_NAME}\\s+${DAY}th,\\s+${YEAR}`, 'Bdy'],
].map(([pattern, order]) => [new RegExp(`^${pattern}$`, 'i'), order as 'ymd' | 'mdy' | 'Bdy'])

// A real calendar day? (No February 30, no year 0.)
function realDate(year: number, month: number, day: number): boolean {
  if (year < 1) return false
  const daysInMonth = new Date(Date.UTC(2000, month, 0)).getUTCDate() // 2000 is a leap year
  if (month === 2 && day === 29) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return day <= daysInMonth
}

const pad = (n: number, width: number) => String(n).padStart(width, '0')

export function normalizeDate(text: string): string | null {
  const trimmed = text.trim()
  for (const [pattern, order] of FORMATS) {
    const match = pattern.exec(trimmed)
    if (!match) continue
    let year: number, month: number, day: number
    if (order === 'ymd') [year, month, day] = [+match[1], +match[2], +match[3]]
    else if (order === 'mdy') [month, day, year] = [+match[1], +match[2], +match[3]]
    else [month, day, year] = [MONTHS.indexOf(match[1].toLowerCase()) + 1, +match[2], +match[3]]
    // Like strptime: a format that matches but is not a real day fails, and
    // the next format is tried.
    if (!realDate(year, month, day)) continue
    return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
  }
  return null
}

export const normalizePhone = (text: string) => [...text].filter((c) => c >= '0' && c <= '9').join('')

export const normalizeText = (text: string) => text.trim().split(/\s+/).filter(Boolean).join(' ').toLowerCase()

export function normalize(field: string, value: string): string | null {
  if (field.endsWith('_date')) return normalizeDate(value)
  if (field.endsWith('_phone')) return normalizePhone(value)
  return normalizeText(value)
}

export function check(form: Record<string, string | null | undefined>, facts: Record<string, string | null>): Mismatch[] {
  const mismatches: Mismatch[] = []
  for (const [field, fact] of Object.entries(facts)) {
    if (fact === null || fact === undefined) continue
    const written = form[field] ?? null
    if (written === null || written.trim() === '') {
      mismatches.push({ field, form: written, fact })
      continue
    }
    const a = normalize(field, written)
    const b = normalize(field, fact)
    if ((a === null && b === null) || a !== b) mismatches.push({ field, form: written, fact })
  }
  return mismatches
}
