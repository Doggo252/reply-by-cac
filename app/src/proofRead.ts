// Reads the answers a proof paper holds, from the words on its photo: the
// Social Security amount, the bank's name and balance, the Medicare number,
// and so on. All on the phone, no AI. The person always sees what was read
// and can change it before it goes on the form.
import { amountOnLine, findAmounts } from './textFinds'
import { money, type ProofKind, type RenewalAnswers } from './renewalForm'

const dollars = (amount: number | null) => (amount === null ? undefined : money(String(amount)))

// The answers found on one paper. Only the ones it could read.
export function readProof(kind: ProofKind, text: string): RenewalAnswers {
  const found: Record<string, string | undefined> = {}

  if (kind === 'social_security') {
    // The yearly letter lists the amount before deductions, then what is taken
    // out for Medicare, then what is paid. The form asks for the first one.
    found.social_security_amount = dollars(
      amountOnLine(text, /before\s+(any\s+)?deduction/i) ??
        amountOnLine(text, /(new|monthly)\s+(benefit|payment)\s+amount/i) ??
        amountOnLine(text, /benefit/i),
    )
    found.medicare_part_b_premium = dollars(amountOnLine(text, /medicare/i))
  }

  if (kind === 'pension') {
    found.pension_amount = dollars(
      amountOnLine(text, /gross/i) ?? amountOnLine(text, /(monthly|pension)\s+(benefit|payment|amount)/i) ?? findAmounts(text)[0] ?? null,
    )
  }

  if (kind === 'bank') {
    const name = text
      .split('\n')
      .map((line) => line.replace(/\(.*?\)/g, '').trim())
      .find((line) => /\b(bank|credit union|savings|federal)\b/i.test(line) && !/statement|balance|account|deposit/i.test(line) && line.length <= 40)
    found.bank_name = name?.replace(/[^A-Za-z0-9&.' -]/g, '').trim() || undefined
    found.bank_balance = dollars(
      amountOnLine(text, /(ending|closing|new|current)\s+balance/i) ?? amountOnLine(text, /balance/i),
    )
  }

  if (kind === 'medicare_card') {
    found.medicare_number = medicareNumber(text) ?? undefined
  }

  if (kind === 'life_insurance') {
    found.life_insurance_value = dollars(amountOnLine(text, /cash\s+(surrender\s+)?value/i))
  }

  return Object.fromEntries(Object.entries(found).filter((entry): entry is [string, string] => !!entry[1]))
}

// A Medicare number has 11 letters and numbers, in a set pattern, usually
// printed as 1EG4-TE5-MK73. The photo reader sometimes reads 0 as O, so
// that is fixed where the pattern needs a number.
export function medicareNumber(text: string): string | null {
  const digitAt = new Set([0, 3, 6, 9, 10])
  for (const match of text.toUpperCase().matchAll(/\b([0-9O][A-Z0-9]{3})[-\s]?([A-Z0-9]{3})[-\s]?([A-Z0-9]{4})\b/g)) {
    const chars = (match[1] + match[2] + match[3]).split('').map((c, i) => (digitAt.has(i) && c === 'O' ? '0' : c))
    const ok = chars.every((c, i) => {
      if (digitAt.has(i)) return /[0-9]/.test(c) && !(i === 0 && c === '0')
      if (i === 1 || i === 4 || i === 7 || i === 8) return /[A-Z]/.test(c) && !'SLOIBZ'.includes(c)
      return /[A-Z0-9]/.test(c) && !'SLOIBZ'.includes(c)
    })
    if (ok) return `${chars.slice(0, 4).join('')}-${chars.slice(4, 7).join('')}-${chars.slice(7).join('')}`
  }
  return null
}

// Whether a value really is in a paper's text: used to check the AI helper
// (Neil's fill_renewal_answers rule: nothing that is not on the paper).
export function valueInText(question: string, value: string, text: string): boolean {
  if (!value.trim()) return false
  if (question === 'medicare_number') {
    const plain = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
    return plain(text).replace(/O/g, '0').includes(plain(value).replace(/O/g, '0'))
  }
  if (question === 'bank_name') {
    const plain = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
    return plain(text).includes(plain(value))
  }
  // An amount: the same number must be printed on the paper.
  const number = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(number) && findAmounts(text).some((amount) => Math.abs(amount - number) < 0.005)
}
