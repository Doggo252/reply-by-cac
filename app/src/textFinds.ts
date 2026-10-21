// Finds things in text read off a photo: dates, phone numbers, case numbers
// and dollar amounts. Used when the scanner is not sure (the confirm screen
// offers what it found as choices), to check photos, and to read amounts off
// proof papers. All on the phone, no AI.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH_WORD = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?'

const pad = (n: number) => String(n).padStart(2, '0')
const realDate = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

// Every date in the text, as YYYY-MM-DD, without repeats, in the order found.
// "10/05/2026", "Oct 5, 2026" and "October 2026" (the last day of that month,
// so a statement "for October" counts as October) all count.
export function findDates(text: string): string[] {
  const found: string[] = []
  const add = (y: number, m: number, d: number) => {
    if (y < 100) y += 2000
    if (y >= 1900 && y <= 2100 && realDate(y, m, d) && !found.includes(iso(y, m, d))) found.push(iso(y, m, d))
  }
  for (const match of text.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/g)) {
    add(Number(match[3]), Number(match[1]), Number(match[2]))
  }
  for (const match of text.matchAll(new RegExp(`\\b${MONTH_WORD}\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi'))) {
    add(Number(match[3]), MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1, Number(match[2]))
  }
  for (const match of text.matchAll(new RegExp(`\\b${MONTH_WORD}\\s+(\\d{4})\\b`, 'gi'))) {
    const month = MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1
    add(Number(match[2]), month, lastDay(Number(match[2]), month))
  }
  return found
}

// Every phone number, written "(408) 555-0123".
export function findPhones(text: string): string[] {
  const found: string[] = []
  for (const match of text.matchAll(/\(?\b(\d{3})\)?[\s.-]*(\d{3})[\s.-]?(\d{4})\b/g)) {
    const phone = `(${match[1]}) ${match[2]}-${match[3]}`
    if (!found.includes(phone)) found.push(phone)
  }
  return found
}

// Words that look like a case number: 6 to 12 letters and digits, with at
// least 3 digits, and not a date, a phone number or a ZIP code.
export function findCaseNumbers(text: string): string[] {
  const found: string[] = []
  const phones = findPhones(text).map((p) => p.replace(/\D/g, ''))
  for (const match of text.matchAll(/\b[A-Z0-9]{6,12}\b/g)) {
    const word = match[0]
    const digits = word.replace(/\D/g, '')
    if (digits.length < 3 || phones.includes(digits) || /^(19|20)\d{2}$/.test(word)) continue
    if (!found.includes(word)) found.push(word)
  }
  return found
}

// Every dollar amount, as a number. "$1,240.00" is 1240. The photo reader
// sometimes puts a space inside a number ("$1 ,240.00"), so those spaces
// are taken out first.
export function findAmounts(text: string): number[] {
  const joined = text.replace(/(\d)[ \t]*([,.])[ \t]*(?=\d)/g, '$1$2')
  return [...joined.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+(?:\.\d{2})?)/g)].map((m) => Number(m[1].replace(/,/g, '')))
}

// The first dollar amount on the first line that matches the pattern.
export function amountOnLine(text: string, pattern: RegExp): number | null {
  for (const line of text.split('\n')) {
    if (!pattern.test(line)) continue
    const amounts = findAmounts(line)
    if (amounts.length > 0) return amounts[0]
  }
  return null
}
