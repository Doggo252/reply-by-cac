// Fills in "About you" from the letter, on the phone, with no AI (the name
// and address are blanked before the AI ever sees the letter). It is only a
// first guess: the person checks it, and types a new address if they moved.
import type { AboutYou } from './packet'
import { findDates } from './textFinds'

// The person's date of birth, printed on a renewal letter ("It's time to
// renew benefits for: Name, Date of birth"). Mom's Oct 21 test: the app asked
// for it even though it was on the letter. A date at least 18 years ago is a
// birthday, not a notice or due date. Only one such date, or none.
export function birthDateFromLetter(text: string, today: string): string | null {
  const cutoff = `${Number(today.slice(0, 4)) - 18}${today.slice(4)}`
  const old = findDates(text).filter((date) => date <= cutoff)
  return old.length === 1 ? old[0] : null
}

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

// The photo reader often joins the address with the box beside it on the
// same line ("1240 Broadway Notice date: October 10, 2026"), so a line is cut
// where one of the box's labels starts.
const BOX_LABEL = /\b(?:notice\s*date|case\s*number|case\s*name|worker\s*(?:name|number|id|telephone)|telephone\s*number|customer\s*id|calheers|saws)\b.*$/i
const clean = (line: string) => line.replace(BOX_LABEL, '')

// "6499 Castro St", "5212 Alameda Ave" or "8966 Alameda Ave Apt 23", anywhere on a line.
const STREET = /\b\d{2,6}[ \t]+(?:[A-Z][a-z]+[ \t]+){1,3}(?:St|Ave|Rd|Dr|Blvd|Way|Ln|Ct|Pl)\b\.?(?:[ \t]+(?:Apt|Unit|#)[ \t]*\w+)?/
// A street with no "St" or "Ave" ("1240 Broadway", "3323 El Camino Real"),
// only when it is the whole line.
const PLAIN_STREET = /^[ \t]*(\d{2,6}[ \t]+[A-Z][A-Za-z]+(?:[ \t]+[A-Z][A-Za-z]+){0,3})[ \t]*$/
// "Redwood City, CA 94063-2342". The comma is sometimes missing, and the
// reader sometimes writes "ca" or garbles the ZIP code ("ca gq 086"): then
// the city is still kept, and the person types the ZIP.
const CITY = /\b([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,2}),?[ \t]+(?:CA|Ca|ca)\b[ \t]*([^\n]*)/

// The line above an address says whose it is: the county's own office
// ("Santa Clara County Social Services", "Santa Clara County Medi-Cal Office"),
// or a person's name ("Gloria Lee"), the way a mailing address starts.
const COUNTY_WORDS = /\bcounty\b|social\s+services|\bagency\b|\boffice\b|\bdepartment\b/i
const NAME_AT_END = /([A-Z][a-z'-]+(?:[ \t]+[A-Z][a-z'-]+){1,3})[ \t.]*$/

type Address = { line: number; street: string; city: string; zip: string | null; county: boolean; nameAbove: string | null }

// Every street line with a city line right under it.
function addresses(lines: string[]): Address[] {
  const found: Address[] = []
  lines.forEach((raw, i) => {
    const line = clean(raw)
    const street = STREET.exec(line)?.[0] ?? PLAIN_STREET.exec(line)?.[1]
    const city = i + 1 < lines.length ? CITY.exec(clean(lines[i + 1])) : null
    if (!street || !city) return
    const zip = /(9\d{4})/.exec(city[2].replace(/\s/g, ''))
    const above = i > 0 ? clean(lines[i - 1]) : ''
    const county = COUNTY_WORDS.test(above)
    const nameAbove = county ? null : NAME_AT_END.exec(above)?.[1] ?? null
    found.push({ line: i, street: street.trim(), city: city[1], zip: zip ? zip[1] : null, county, nameAbove })
  })
  return found
}

// The county's own office address is on the letter too, and is never taken
// for the person's. Of the rest, the person's address is the one closest to
// their name ("Case name: ..."), and on a tie the one after it. When the photo
// reader missed that label, it is the one under a person's name. Oct 22 run:
// with the name missed, the app filled in the county office's address.
export function aboutFromLetter(text: string): Partial<AboutYou> {
  const about: Partial<AboutYou> = {}
  const name = nameAfterLabel(text)
  if (name) about.name = name
  // Blank lines are skipped: the photo reader often puts one between the
  // street and the city, so they no longer looked like an address.
  const lines = text.split('\n').filter((line) => line.trim() !== '')
  const nameLine = name ? lines.findIndex((l) => /case\s*name|notice\s*for/i.test(l) && l.includes(name)) : -1
  const found = addresses(lines).filter((address) => !address.county)
  const underName = found.filter((address) => address.nameAbove)
  const best =
    nameLine < 0
      ? underName[0] ?? found[0]
      : [...found].sort((a, b) => Math.abs(a.line - nameLine) - Math.abs(b.line - nameLine) || b.line - a.line)[0]
  if (best) {
    about.street = best.street
    about.city = best.city
    if (best.zip) about.zip = best.zip
    if (!about.name && best.nameAbove) about.name = best.nameAbove
  }
  if (/san\s+mateo/i.test(text)) about.county = 'San Mateo'
  else if (/santa\s+clara/i.test(text)) about.county = 'Santa Clara'
  else if (SAN_MATEO_CITIES.test(text)) about.county = 'San Mateo'
  else if (SANTA_CLARA_CITIES.test(text)) about.county = 'Santa Clara'
  return about
}

// Cities in each county, for when the photo reader garbled the county's name
// ("COUNTY OF SAN TITS", Oct 20 run): a city on the letter tells which one.
// San Mateo is checked first, so "East Palo Alto" is not read as Palo Alto.
const SAN_MATEO_CITIES =
  /\b(?:South San Francisco|Daly City|San Bruno|Millbrae|Burlingame|Foster City|Belmont|San Carlos|Redwood City|Menlo Park|East Palo Alto|Pacifica|Half Moon Bay|Brisbane|Colma|Atherton)\b/i
const SANTA_CLARA_CITIES =
  /\b(?:San Jose|Sunnyvale|Mountain View|Palo Alto|Cupertino|Milpitas|Campbell|Los Gatos|Saratoga|Los Altos|Gilroy|Morgan Hill)\b/i
