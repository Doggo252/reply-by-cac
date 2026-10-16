// Blanks out private details before any letter text leaves the phone.
//
// The only step of this app that needs the internet is asking the AI to read
// the letter. Before that happens, this scrubs out anything that identifies
// the person. What gets blanked was Neil's decision:
//   - Social Security numbers, and any run of 6 or more digits
//   - case numbers and ID numbers, even when the text reader garbles them
//   - the person's name, wherever it appears
//   - the person's street address and city line
// The worker's name and phone are kept when labeled, since the reply has to go
// back to them.
//
// backend/redact.py does exactly the same thing again on the server, as a
// backup. The two files must stay in step; a test checks they give the same
// output on 480 real text-reader results.

export type Redacted = {
  text: string
  // How many of each kind were blanked.
  counts: Record<string, number>
  // The names it found, so the same names can be blanked in other text too.
  names: string[]
}

// Not a bare "name" label: that would also catch "Worker name".
const NAME_LABELS = 'notice for|case name|names?\\(s\\)|this notice applies to|for'
const ID_LABELS = 'saws case number|calheers case number|case number|customer id'

type Rule = { pattern: RegExp; kind: string; blank: string; remember: boolean }

// Labels are found anywhere on a line, not just at the start: the text reader
// often joins two columns into one line. [ \t] is used instead of \s so that a
// label with nothing after it does not swallow the next line.
const RULES: Rule[] = [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, kind: 'ssn', blank: '[ssn]', remember: false },
  { pattern: /\d{6,}/g, kind: 'number', blank: '[number]', remember: false },
  // A case number: a 6 to 9 character code of capital letters and at least 3
  // digits. The real pattern is #L#L###, but the text reader swaps look-alike
  // characters (it read 1B7P329 as 187P329), so any mix counts.
  {
    pattern: /(?<![A-Za-z0-9])(?=(?:[A-Z]*\d){3})(?=\d*[A-Z])[A-Z0-9]{6,9}(?![A-Za-z0-9])/g,
    kind: 'case',
    blank: '[case]',
    remember: false,
  },
  {
    pattern: new RegExp(`(?<keep>\\b(?:${ID_LABELS})[ \\t]*:?[ \\t]*)[^\\s:].*$`, 'gim'),
    kind: 'case',
    blank: '[case]',
    remember: true,
  },
  {
    pattern: new RegExp(`(?<keep>\\b(?:${NAME_LABELS})[ \\t]*:[ \\t]*)[^\\s:].*$`, 'gim'),
    kind: 'name',
    blank: '[name]',
    remember: true,
  },
  {
    pattern: new RegExp(`(?<keep>\\b(?:${NAME_LABELS})[ \\t]*:[ \\t]*\\n)[ \\t]*\\S.*$`, 'gim'),
    kind: 'name',
    blank: '[name]',
    remember: true,
  },
  {
    pattern: /^\s*\d{1,6}\s+[\w.'\s-]+\b(st|ave|rd|blvd|dr|way|ln|ct|real|pl|cir|apt|#)\b.*$/gim,
    kind: 'address',
    blank: '[address]',
    remember: false,
  },
  // A city line, even with a scrap of junk after the ZIP code.
  { pattern: /^.*\bCA\s+\d{5}(-\d{4})?\b.*$/gim, kind: 'address', blank: '[address]', remember: false },
]

const BLANK = /^\[\w+\]$/

// A line that is just a name: two to four capitalized words, no digits.
const LOOKS_LIKE_NAME = /^[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){1,3}$/

// Words printed on the forms themselves. A short capitalized line holding one
// of these is part of the form ("Social Services Agency"), not a name.
const FORM_WORDS = new Set(
  `medi cal program services agency department county health california state
human social notice action benefits request information renewal form case
worker office hours name names date stamp denial discontinuance attention
important page questions number read first online mail phone person step
household members birth care covered steps hearing rights back mc rv`.split(/\s+/)
)

// Header labels that a name can get glued in front of.
const HEADER_LABEL = /\b(notice date|case number|case name|notice for|worker|office hours)\b/i

// Scraps the text reader leaves at the ends of a line: 1 or 2 lowercase
// letters, digits, or symbols. (Not capitalized scraps: "Le" is a real name.)
const JUNK = /^(?:[a-z]{1,2}|\d{1,2}|[^A-Za-z0-9]+)$/

// "Maria Garcia   05/23/1950" at the end of a line: the renewal's table.
const NAME_THEN_BIRTHDAY = /^(?<name>[A-Za-z][A-Za-z.' -]{2,}?)\s+(?<date>\d{1,2}\/\d{1,2}\/\d{4})\s*$/gm

function stripJunk(line: string): string {
  const words = line.split(/\s+/).filter((w) => w !== '')
  while (words.length && JUNK.test(words[0])) words.shift()
  while (words.length && JUNK.test(words[words.length - 1])) words.pop()
  return words.join(' ')
}

function hasFormWords(line: string): boolean {
  return line.toLowerCase().split(/[^a-z]+/).some((word) => FORM_WORDS.has(word))
}

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// `alsoBlank` is for the AI helper (agentLoop.ts): names and address words we
// already know belong to the person, blanked wherever they appear even with no
// label next to them. Only the phone uses it; letter text sent by readerA.ts
// does not, so backend/redact.py still gives the same answers.
export function redact(input: string, alsoBlank: string[] = []): Redacted {
  const counts: Record<string, number> = { ssn: 0, number: 0, case: 0, name: 0, address: 0 }
  const found: [string, string][] = alsoBlank.map((value) => [value, 'name']) // [value, kind] seen after a label
  let text = input

  for (const rule of RULES) {
    text = text.replace(rule.pattern, (...match) => {
      const groups = match[match.length - 1]
      const keep: string = typeof groups === 'object' && groups?.keep !== undefined ? groups.keep : ''
      const value = (match[0] as string).slice(keep.length).trim()
      // Something an earlier rule already blanked is not counted twice.
      if (!BLANK.test(value)) {
        counts[rule.kind] += 1
        if (rule.remember) found.push([value, rule.kind])
      }
      return keep + rule.blank
    })
  }

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    // 1. A line that is only a name, maybe with a scrap of junk at either end.
    const line = stripJunk(raw)
    if (LOOKS_LIKE_NAME.test(line) && !hasFormWords(line)) {
      found.push([line, 'name'])
      lines[i] = '[name]'
      counts.name += 1
      continue
    }
    // 2. A name glued to the front of a header label.
    const label = HEADER_LABEL.exec(raw)
    if (label) {
      const front = stripJunk(raw.slice(0, label.index))
      if (LOOKS_LIKE_NAME.test(front) && !hasFormWords(front)) {
        found.push([front, 'name'])
        lines[i] = '[name] ' + raw.slice(label.index)
        counts.name += 1
      }
    }
  }
  text = lines.join('\n')

  // 3. The renewal's table: a name followed by a date of birth.
  for (const match of text.matchAll(NAME_THEN_BIRTHDAY)) found.push([match.groups!.name.trim(), 'name'])
  text = text.replace(NAME_THEN_BIRTHDAY, (...match) => {
    counts.name += 1
    return `[name] ${match[match.length - 1].date}`
  })

  // The same name or number often appears again elsewhere on the page. Blank
  // every copy, and for names every word of the name, since the text reader
  // often misspells one copy.
  for (const [rawValue, kind] of found) {
    const value = rawValue.replace(/^[_| \t]+|[_| \t]+$/g, '')
    if (value.length < 4) continue
    const pieces = [value, ...(kind === 'name' ? value.split(/\s+/).filter((w) => w !== '') : [])]
    for (const piece of pieces) {
      if (piece.length >= 3 && !BLANK.test(piece)) {
        const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeForRegex(piece)}(?![A-Za-z0-9])`, 'g')
        text = text.replace(pattern, () => {
          counts[kind] += 1
          return `[${kind}]`
        })
      }
    }
  }
  const names = found.filter(([, kind]) => kind === 'name').map(([value]) => value)
  return { text, counts, names }
}
