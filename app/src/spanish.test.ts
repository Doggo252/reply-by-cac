/// <reference types="node" />
// Every English sentence a screen can show has a Spanish one (spanish.ts), with
// the same {words} to fill in. A missing one would show up in English for a
// Spanish speaker, so a new sentence without Spanish fails here.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SPANISH } from './spanish'
import { FACT_LABELS, LETTER_NAMES } from './words'
import { HELP, MC355_BOXES } from './paperHelp'
import { FROM_PAPER_NAMES, PROOF_PAPERS, RENEWAL_QUESTIONS, renewalPapers } from './renewalForm'
import { whereToLook } from './Confirm'
import { whatToSend } from './letterJob'
import { RENEWAL_FORM } from './usePapers'
import { COUNTY_WORDS } from './countyForm'

const dir = new URL('.', import.meta.url)
const source = (file: string) => readFileSync(new URL(file, dir), 'utf-8')

// The English sentences written inside t('...') in the app's code.
function sentencesInCode(): string[] {
  const found = new Set<string>()
  const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts') && f !== 'spanish.ts' && f !== 'language.ts')
  for (const file of files) {
    for (const match of source(file).matchAll(/\bt\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g)) {
      found.add(match[1].slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"'))
    }
  }
  return [...found]
}

// Plain-English sentences kept in lists inside one file, found by a pattern.
const listed = (file: string, pattern: RegExp) => [...source(file).matchAll(pattern)].map((m) => m[1] ?? m[2])

// Sentences shown by passing a value to t(), not written inside t('...').
function sentencesInData(): string[] {
  const yesToAll = Object.fromEntries(RENEWAL_QUESTIONS.map((q) => [q.id, 'yes']))
  return [
    ...Object.values(LETTER_NAMES),
    ...Object.values(FACT_LABELS),
    ...MC355_BOXES,
    ...HELP.flatMap(([, h]) => [h.what, h.where, ...(h.noneLabel ? [h.noneLabel] : [])]),
    ...RENEWAL_QUESTIONS.flatMap((q) => [q.ask, ...(q.help ? [q.help] : []), ...(q.placeholder ? [q.placeholder] : []), ...(q.choices ?? [])]),
    ...Object.values(PROOF_PAPERS),
    ...renewalPapers(yesToAll),
    ...Object.values(FROM_PAPER_NAMES),
    ...COUNTY_WORDS,
    ...['notice_date', 'due_date', 'effective_date', 'case_number', 'worker_name', 'worker_phone', 'ask'].flatMap((field) =>
      ['MC_239A', 'MC355', 'MC210_RV'].map((type) => whereToLook(field, type)),
    ),
    ...whatToSend('MC210_RV', null),
    ...whatToSend('MC355', null),
    ...whatToSend('MC_239A', null),
    RENEWAL_FORM,
    RENEWAL_FORM.replace(', filled in and signed', ''),
    // The yellow-box messages (flags.ts), photo check labels, helper log words,
    // timeline events, paper answers and the county-mistake reasons.
    ...listed('flags.ts', /(?:flags(?:\.\w+|\[\w+\]) \?{0,2}= |flagAll\()(?:"([^"]+)"|'([^']+)')/g),
    ...listed('photoCheck.ts', /label: '([^']+)'/g),
    'this paper',
    ...listed('agentWords.ts', /^ {2}\w+: '([^']+)',$/gm),
    ...listed('Timeline.tsx', /label: '([^']+)'/g),
    ...listed('PaperSteps.tsx', /^ {2}\w+: (?:"([^"]+)"|'([^']+)'),$/gm),
    ...listed('contradictions.ts', /reason:\s*(?:"([^"]+)"|'([^']+)')/g),
  ].filter(Boolean)
}

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(' ')

describe('Spanish', () => {
  it('has every sentence written in the code', () => {
    const missing = sentencesInCode().filter((s) => !(s in SPANISH))
    expect(missing).toEqual([])
  })

  it('has every sentence kept in the lists (papers, questions, messages)', () => {
    const missing = [...new Set(sentencesInData())].filter((s) => !(s in SPANISH))
    expect(missing).toEqual([])
  })

  it('keeps the same {words} to fill in', () => {
    const wrong = Object.entries(SPANISH).filter(([english, spanish]) => placeholders(english) !== placeholders(spanish))
    expect(wrong).toEqual([])
  })
})
