// Plain words the screens share. Neil's rule: the user sees words like
// "a request for more information", never codes like MC355.

export const LETTER_NAMES: Record<string, string> = {
  MC_239A: 'A letter saying your Medi-Cal will stop',
  MC355: 'A letter asking for more papers',
  MC210_RV: 'Your yearly renewal packet',
  OTHER: 'Not one of the letters this app handles',
}
export const plain = (type: string) => LETTER_NAMES[type] ?? type

// "2026-10-06" becomes "Tuesday, October 6, 2026". UTC so the day never
// shifts with the phone's time zone.
export function inWords(date: string, weekday = true): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: weekday ? 'long' : undefined,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// When a file was saved, in the phone's own time zone: "October 9, 2026".
export const savedOn = (isoTime: string) =>
  new Date(isoTime).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

// What each fact is called on screen.
export const FACT_LABELS: Record<string, string> = {
  notice_date: 'Date on the letter',
  effective_date: 'Date your Medi-Cal stops',
  due_date: 'Date they need your answer by',
  ask: 'What the county is asking for',
  worker_name: "Your worker's name",
  worker_phone: "Your worker's phone number",
  case_number: 'Case number',
}
