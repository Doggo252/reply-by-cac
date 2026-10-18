// Fills in "About you" from the letter, on the phone, with no AI (the name
// and address are blanked before the AI ever sees the letter). It is only a
// first guess: the person checks it, and types a new address if they moved.
import type { AboutYou } from './packet'

// A person's name after one of the letter's labels, on the same line.
// The label can be in any case, but the name must look like one: each word
// a capital then small letters, so a misread like "witiiam" or the next
// label ("CALHEERS CASE NUMBER") is not taken for a name.
function nameAfterLabel(text: string): string | null {
  for (const label of text.matchAll(/(?:case\s*name|notice\s*for)\s*:?[ \t]*/gi)) {
    const rest = text.slice(label.index + label[0].length)
    const match = /^[A-Z][a-z'-]+(?:[ \t]+[A-Z][a-z'-]+){1,3}/.exec(rest)
    if (match) return match[0]
  }
  return null
}

// "6499 Castro St", "5212 Alameda Ave" or "8966 Alameda Ave Apt 23".
const STREET = /\b\d{2,6}[ \t]+(?:[A-Z][a-z]+[ \t]+){1,3}(?:St|Ave|Rd|Dr|Blvd|Way|Ln|Ct|Pl)\b\.?(?:[ \t]+(?:Apt|Unit|#)[ \t]*\w+)?/
// A street with no "St" or "Ave" ("1240 Broadway", "3323 El Camino Real"),
// counted only when the city line comes right after it.
const PLAIN_STREET = /^[ \t]*(\d{2,6}[ \t]+[A-Z][A-Za-z]+(?:[ \t]+[A-Z][A-Za-z]+){0,3})[ \t]*$(?=\n[^\n]*\bCA[ \t]+9\d{4})/m
// "Redwood City, CA 94063-2342" (the comma is sometimes missing).
const CITY = /\b([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,2}),?[ \t]+CA[ \t]+(9\d{4})/

// The county's own office address is printed at the top, so the person's
// address is the first one after their name.
export function aboutFromLetter(text: string): Partial<AboutYou> {
  const about: Partial<AboutYou> = {}
  const name = nameAfterLabel(text)
  if (name) about.name = name
  const after = name ? text.slice(text.indexOf(name)) : ''
  const street = STREET.exec(after)
  const plain = PLAIN_STREET.exec(after)
  // Whichever street comes first after the name.
  const first = street && (!plain || street.index <= plain.index) ? street[0] : plain?.[1]
  const at = first ? after.indexOf(first) : -1
  const city = CITY.exec(after.slice(Math.max(at, 0)))
  if (first && city) {
    about.street = first.trim()
    about.city = city[1]
    about.zip = city[2]
  }
  if (/san\s+mateo/i.test(text)) about.county = 'San Mateo'
  else if (/santa\s+clara/i.test(text)) about.county = 'Santa Clara'
  return about
}
