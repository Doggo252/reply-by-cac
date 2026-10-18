// Which facts get a "please double-check" flag on the confirm screen.
//
// The rules are Neil's decision (2026-10-07, changed 2026-10-18). A fact is
// flagged when:
//   - it is empty
//   - the AI said its certainty was "low" (every fact is flagged)
//   - the photo was read with under 70% confidence (every fact is flagged)
//   - the dates do not make sense together
// Plus one more from the same idea: a case number the phone had to repair.

export type ReadingMode = 'ai' | 'phone'

export const LOW_PHOTO_CONFIDENCE = 70
// More than this many days between the notice and the due date looks wrong.
export const MAX_DAYS_TO_RESPOND = 60

const DAY_MS = 24 * 60 * 60 * 1000
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)

export type FlagInput = {
  fields: string[] // the facts shown on the screen
  facts: Record<string, string | null>
  mode: ReadingMode
  certainty: string | null // from the AI reader
  photoConfidence: number // from the text reader, 0 to 100
  repaired: string[] // facts the phone had to repair
  today: string
}

// Returns a reason for each flagged fact, in plain words.
export function flagsFor(input: FlagInput): Record<string, string> {
  const flags: Record<string, string> = {}
  const flagAll = (reason: string) => {
    for (const field of input.fields) flags[field] ??= reason
  }
  const { facts } = input

  for (const field of input.fields) {
    if (!facts[field]) flags[field] = "We couldn't find this. Please type it in from your letter."
  }
  if (facts.due_date && facts.notice_date && facts.due_date < facts.notice_date) {
    flags.due_date = 'This is before the date on the letter. Please check both.'
    flags.notice_date ??= 'This is after the answer-by date. Please check both.'
  }
  if (facts.effective_date && facts.notice_date && facts.effective_date < facts.notice_date) {
    flags.effective_date = 'This is before the date on the letter. Please check both.'
    flags.notice_date ??= 'This is after the date your Medi-Cal stops. Please check both.'
  }
  if (facts.notice_date && facts.notice_date > input.today) {
    flags.notice_date = "This date hasn't happened yet. Please check it."
  }
  if (facts.due_date && facts.notice_date && days(facts.notice_date, facts.due_date) > MAX_DAYS_TO_RESPOND) {
    flags.due_date = 'This is a long time after the date on the letter. Please check it.'
  }
  for (const field of input.repaired) {
    if (input.fields.includes(field)) flags[field] ??= 'This was hard to read. Please check it.'
  }

  // Phone-only mode used to flag every fact. On Oct 18 Neil changed it to the
  // same rules as AI mode, after a walkthrough showed six yellow boxes on a
  // letter the phone had read perfectly.
  if (input.certainty === 'low') flagAll("We're not sure about this one. Please check it.")
  if (input.photoConfidence < LOW_PHOTO_CONFIDENCE) flagAll('The photo was hard to read. Please check it.')
  return flags
}

// Which facts the confirm screen shows for each kind of letter.
export function fieldsFor(letterType: string): string[] {
  const common = ['worker_name', 'worker_phone', 'case_number']
  if (letterType === 'MC_239A') return ['notice_date', 'effective_date', 'ask', ...common]
  if (letterType === 'MC355') return ['notice_date', 'due_date', 'ask', ...common]
  if (letterType === 'MC210_RV') return ['notice_date', 'due_date', ...common]
  return []
}
