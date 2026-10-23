// The grounding check, on the phone: AI text may only mention dates we know.
//
// A line-by-line copy of backend/grounding.py, so the agent can check Gemini's
// reasons and explanations on the phone (Neil's TOOLS.md, Section 4). A test
// checks it gives the same answers as the Python (fixtures/grounding_cases.json,
// remade with `.venv/bin/python core/eval/make_grounding_cases.py`).

const MONTHS: Record<string, number> = {
  // English, with common short forms
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
  // Spanish
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}
const MONTH_WORD = `(?<month>${Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')})\\.?`

// Each pattern finds one way of writing a date. Year is optional in the word
// forms, because people write "October 4" as well as "October 4, 2026".
const PATTERNS = [
  // 2026-10-04
  /\b(?<year>\d{4})-(?<m>\d{1,2})-(?<day>\d{1,2})\b/g,
  // 10/04/2026 or 10/4/26
  /\b(?<m>\d{1,2})\/(?<day>\d{1,2})\/(?<year>\d{4}|\d{2})\b/g,
  // October 4, 2026 / October 4th / Oct. 4, 2026
  new RegExp(`\\b${MONTH_WORD}\\s+(?<day>\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(?<year>\\d{4}))?`, 'gi'),
  // 4 October 2026 / 4 de octubre de 2026 / 4 de octubre del 2026
  new RegExp(`\\b(?<day>\\d{1,2})(?:st|nd|rd|th|º|°)?\\s+(?:de\\s+)?${MONTH_WORD}(?:\\s+(?:de\\s+|del\\s+)?(?<year>\\d{4}))?`, 'gi'),
]

// A date as "year-month-day", with "????" when the text gave no year.
const key = (year: number | null, month: number, day: number) =>
  `${year ?? '????'}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

// Every date mentioned in the text.
function datesInText(text: string): { year: number | null; month: number; day: number }[] {
  const found = new Map<string, { year: number | null; month: number; day: number }>()
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const parts = match.groups!
      const month = parts.m ? Number(parts.m) : MONTHS[parts.month.toLowerCase()]
      const day = Number(parts.day)
      let year = parts.year === undefined ? null : Number(parts.year)
      if (year !== null && year < 100) year += 2000
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) found.set(key(year, month, day), { year, month, day })
    }
  }
  return [...found.values()]
}

// Dates in the text that are not in the facts. Empty means the text is
// grounded. A date written without a year counts as grounded if its month and
// day match a fact. The facts' dates are the values written YYYY-MM-DD.
export function inventedDates(text: string, facts: Record<string, unknown>): string[] {
  const allowedFull = new Set<string>()
  const allowedNoYear = new Set<string>()
  for (const value of Object.values(facts)) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue
    const [y, m, d] = value.split('-').map(Number)
    const real = new Date(Date.UTC(y, m - 1, d))
    if (real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) continue // like 2026-02-30
    allowedFull.add(key(y, m, d))
    allowedNoYear.add(key(null, m, d))
  }
  return datesInText(text)
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.month - b.month || a.day - b.day)
    .filter(({ year, month, day }) =>
      year === null ? !allowedNoYear.has(key(null, month, day)) : !allowedFull.has(key(year, month, day))
    )
    .map(({ year, month, day }) => key(year, month, day))
}
