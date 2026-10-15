// Finds the key facts in a letter's text, on the phone, with no AI.
//
// Two jobs:
// 1. Neil's "keep everything on my phone" option: this replaces the AI
//    reader, so nothing leaves the phone. It is less accurate than the AI,
//    which is why Neil's rule flags every field for double-checking.
// 2. The case number, in both modes. It is blanked before the AI ever sees
//    the text, so the phone has to find it itself.

export type Facts = {
  notice_date: string | null
  effective_date: string | null
  due_date: string | null
  worker_name: string | null
  worker_phone: string | null
  case_number: string | null
  ask: string | null
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]
const MONTH_WORD = `(${MONTHS.join('|')})`
const pad = (n: number) => String(n).padStart(2, '0')

// A real calendar date as YYYY-MM-DD, or null (so "02/30/2026" is rejected).
function makeDate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

// The first date written in this bit of text, as "09/14/2026" or
// "September 14, 2026".
export function firstDate(text: string): string | null {
  const numeric = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/.exec(text)
  const words = new RegExp(`${MONTH_WORD}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'i').exec(text)
  // Whichever appears first wins.
  const pick = [numeric, words].filter((m) => m !== null).sort((a, b) => a!.index - b!.index)[0]
  if (!pick) return null
  if (pick === numeric) return makeDate(+pick[3], +pick[1], +pick[2])
  return makeDate(+pick[3], MONTHS.indexOf(pick[1].toLowerCase()) + 1, +pick[2])
}

// The text reader sometimes reads the slashes in "10/07/2026" as digits,
// giving "1000712026". Ten digits in a row with a 0, 1 or 7 where each slash
// should be are treated as a date, but only right after a date label, and
// only if it is a real calendar date.
function slashesMisread(text: string): string | null {
  const match = /(?<!\d)(\d{2})[017](\d{2})[017](\d{4})(?!\d)/.exec(text)
  return match ? makeDate(+match[3], +match[1], +match[2]) : null
}

// The first date in the stretch of text right after a label. The text reader
// sometimes puts the value on the next line, so it looks a little way ahead.
function dateAfter(text: string, label: RegExp, reach = 90): string | null {
  const match = label.exec(text)
  if (!match) return null
  const after = text.slice(match.index + match[0].length, match.index + match[0].length + reach)
  return firstDate(after) ?? slashesMisread(after)
}

function lastDayOfMonth(year: number, month: number): string {
  return makeDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate())!
}

// The 2007 MC 239 A only prints a month ("the last day of September"). The
// year comes from the notice date when there is one; otherwise it is the
// year that puts that month closest to today.
function effectiveFromMonth(text: string, noticeDate: string | null, today: string): string | null {
  const match = new RegExp(`last\\s+day\\s+of\\s*_*\\s*${MONTH_WORD}`, 'i').exec(text)
  if (!match) return null
  const month = MONTHS.indexOf(match[1].toLowerCase()) + 1
  const from = noticeDate ?? today
  let year = +from.slice(0, 4)
  // A notice in December about January means next year.
  if (month < +from.slice(5, 7) - 6) year += 1
  return lastDayOfMonth(year, month)
}

// Look-alike characters the text reader mixes up.
const AS_DIGIT: Record<string, string> = { A: '4', O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', '§': '5', G: '6', B: '8', T: '7' }
const AS_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B', '7': 'T' }

// Puts a garbled case number back into the county's #L#L### pattern, or
// returns null if it cannot be one.
export function fixCaseNumber(raw: string): string | null {
  const chars = raw.toUpperCase().replace(/[^A-Z0-9§]/g, '').split('')
  if (chars.length !== 7) return null
  const fixed = chars.map((c, i) => {
    const wantsLetter = i === 1 || i === 3
    if (wantsLetter) return /[A-Z]/.test(c) ? c : AS_LETTER[c] ?? c
    return /[0-9]/.test(c) ? c : AS_DIGIT[c] ?? c
  })
  const result = fixed.join('')
  return /^\d[A-Z]\d[A-Z]\d{3}$/.test(result) ? result : null
}

// The case number, and whether any characters had to be repaired to find it.
// A repaired number can be repaired wrong, so the app asks the user to check it.
export function findCaseNumber(text: string): { value: string | null; repaired: boolean } {
  // 1. After a "Case Number" label (on a CalSAWS notice, the SAWS one; the
  //    CalHEERS number is all digits and never fits the pattern).
  for (const match of text.matchAll(/case\s*number\s*:?\s*_*([^\s]{5,12})/gi)) {
    const fixed = fixCaseNumber(match[1])
    if (fixed) return { value: fixed, repaired: fixed !== match[1].replace(/^_+/, '') }
  }
  // 2. Anywhere: a clean #L#L### on its own.
  const loose = /(?<![A-Za-z0-9])\d[A-Z]\d[A-Z]\d{3}(?![A-Za-z0-9])/.exec(text)
  return { value: loose ? loose[0] : null, repaired: false }
}

// Words that start the next label. When the photo puts two columns on one
// line ("Worker name: Harold Hernandez Case name: James Ramirez"), the name
// stops before these.
const LABEL_WORDS = /^(case|worker|telephone|phone|notice|date|number|id|office|customer|fax)$/i

// A person's name right after a label, up to four words on the same line.
function nameAfter(text: string, label: RegExp): string | null {
  const match = new RegExp(label.source + /\s*:?\s*_*[ \t]*([^\n]*)/.source, 'i').exec(text)
  if (!match) return null
  const words: string[] = []
  for (const word of match[1].trim().split(/[ \t]+/)) {
    if (words.length === 4 || LABEL_WORDS.test(word) || !/^[A-Z][A-Za-z.'-]+$/.test(word)) break
    words.push(word)
  }
  return words.length ? words.join(' ') : null
}

export function findWorkerName(text: string): string | null {
  return nameAfter(text, /worker\s*name/)
}

export function findWorkerPhone(text: string): string | null {
  const match =
    /(?:telephone|phone)(?:\s*number)?\s*:?\s*_*\s*\(?(\d{3})\)?[\s.-]*(\d{3})[\s.-]*(\d{4})/i.exec(text)
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : null
}

// What the county is asking for, in the letter's own words.
// - MC 239 A: the reason sentence, which always starts "You did not".
// - MC 355: the items are check boxes on the later pages, so the phone
//   points the person there.
export function findAsk(text: string, letterType: string): string | null {
  if (letterType === 'MC_239A') {
    const match = /you\s+did\s+not\s[\s\S]{5,500}?\.(?=\s|$)/i.exec(text)
    if (!match) return null
    let ask = match[0]
    // Two columns can push the person's name into the middle of the sentence.
    const caseName = nameAfter(text, /case\s*name/)
    if (caseName) ask = ask.split(caseName).join(' ')
    return ask.replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim()
  }
  if (letterType === 'MC355' && /box\s+checked/i.test(text)) {
    return 'The papers or information with a checked box on the other pages of this letter.'
  }
  return null
}

// Returns the facts, plus the names of any that had to be repaired.
export function findFacts(text: string, letterType: string, today: string): { facts: Facts; repaired: string[] } {
  const notice = dateAfter(text, /notice\s*date\s*:?/i)
  let due: string | null = null
  let effective: string | null = null

  if (letterType === 'MC355') {
    due = dateAfter(text, /must\s+receive\s+this\s+information\s+by/i)
  }
  if (letterType === 'MC210_RV') {
    // Printed twice: in step 3, and in the grey box at the top.
    due = dateAfter(text, /due\s+date\s+of/i) ?? dateAfter(text, /respond\s+by/i)
  }
  if (letterType === 'MC_239A') {
    effective =
      dateAfter(text, /discontinued\s+effective/i, 30) ??
      firstDate(/as\s+of\s+([^,\n]{6,20}),?\s+medi-?cal\s+eligibility\s+has\s+been\s+discontinued/i.exec(text)?.[1] ?? '') ??
      effectiveFromMonth(text, notice, today)
  }

  const caseNumber = findCaseNumber(text)
  return {
    facts: {
      notice_date: notice,
      effective_date: effective,
      due_date: due,
      worker_name: findWorkerName(text),
      worker_phone: findWorkerPhone(text),
      case_number: caseNumber.value,
      ask: findAsk(text, letterType),
    },
    repaired: caseNumber.repaired ? ['case_number'] : [],
  }
}
