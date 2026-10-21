// Checks a photo of a paper before it goes in the reply, from the words read
// off it on the phone:
//   - could any words be read at all (not blurry or dark)
//   - is it the kind of paper asked for
//   - does it show the person's name
//   - for a statement, is it recent: within 2 months (Neil's choice, Oct 20)
// A problem never blocks the person. They can retake it or use it anyway.
import { findDates } from './textFinds'
import { locale, t } from './language'

export const RECENT_DAYS = 61 // "within 2 months"

type Kind = { paper: RegExp; words: RegExp[]; label: string; statement: boolean }

// What each kind of paper says on it. The first match on the paper's name wins.
const KINDS: Kind[] = [
  { paper: /medicare card/i, words: [/medicare/i], label: 'a Medicare card', statement: false },
  { paper: /income/i, words: [/social security|pension|retirement|earnings|gross|pay/i], label: 'proof of income', statement: true },
  { paper: /bank/i, words: [/bank|credit union/i, /statement|balance|account/i], label: 'a bank statement', statement: true },
  { paper: /pension/i, words: [/pension|retirement|annuit/i], label: 'a pension statement', statement: true },
  { paper: /pay stub/i, words: [/earnings|gross|pay period|net pay/i], label: 'a pay stub', statement: true },
  { paper: /social security letter/i, words: [/social security/i], label: 'a Social Security letter', statement: true },
  { paper: /life insurance|stocks|bonds|retirement account/i, words: [/insurance|policy|account|shares|bond/i], label: 'an insurance or account statement', statement: true },
  { paper: /registration|car\b|vehicle/i, words: [/registration|dmv|vehicle|plate|vin\b/i], label: 'a car registration', statement: false },
  { paper: /house|land|property/i, words: [/property|deed|parcel|assessor|tax/i], label: 'papers for a house or land', statement: false },
  { paper: /address|rent|utility/i, words: [/rent|utility|electric|gas|water|bill|lease/i], label: 'a bill or rent receipt', statement: false },
  { paper: /immigration/i, words: [/permanent resident|uscis|immigration|resident|visa/i], label: 'immigration papers', statement: false },
  { paper: /disability/i, words: [/disability|social security/i], label: 'a disability award letter', statement: false },
  { paper: /driver|photo id/i, words: [/driver|license|identification|dmv/i], label: 'an ID card', statement: false },
]

export type PhotoCheck = {
  ok: boolean
  problems: string[] // in plain words
  found: string // what it looks like, like "a bank statement from September 2026"
}

const monthYear = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' })

// Two words match when they are the same, or (for longer words) one letter off,
// since the photo reader sometimes misreads a letter.
function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      i++
      j++
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

// The words come back already in the person's language (language.ts).
export function checkPhoto(paperName: string, text: string, personName: string, today: string): PhotoCheck {
  if (text.replace(/\s+/g, '').length < 25) {
    return {
      ok: false,
      problems: [t("We couldn't read the words on this photo. It may be blurry, too dark, or too far away.")],
      found: '',
    }
  }
  const problems: string[] = []
  const kind = KINDS.find((k) => k.paper.test(paperName))
  if (kind && !kind.words.every((pattern) => pattern.test(text))) {
    problems.push(t("This doesn't look like {what}. Check that it's the right paper.", { what: t(kind.label) }))
  }

  const words = new Set(text.toLowerCase().match(/[a-z]{3,}/g) ?? [])
  const nameWords = personName.toLowerCase().match(/[a-z]{3,}/g) ?? []
  if (nameWords.length > 0 && !nameWords.some((n) => [...words].some((w) => sameWord(n, w)))) {
    problems.push(t("We couldn't find your name on it. The county needs papers that show your name."))
  }

  // The newest date on the paper that is not in the future.
  const newest = findDates(text).filter((d) => d <= today).sort().pop()
  if (kind?.statement && newest) {
    const age = (Date.parse(today) - Date.parse(newest)) / 86_400_000
    if (age > RECENT_DAYS) {
      problems.push(t('This is from {month}. The county asks for current proof, so a newer one is better.', { month: monthYear(newest) }))
    }
  }

  const label = t(kind?.label ?? 'this paper')
  return {
    ok: problems.length === 0,
    problems,
    found: kind && newest ? t('{what} from {month}', { what: label, month: monthYear(newest) }) : label,
  }
}
