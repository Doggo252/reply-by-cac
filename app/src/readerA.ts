// Reader A: asks the backend to have the AI read the letter.
//
// This is the one step that needs the internet. The text is scrubbed of
// private details (redact.ts) before it leaves the phone, and the backend
// scrubs it again. If the phone is offline or the server is down, this
// returns null and the app carries on with Reader B alone.
import { redact } from './redact'
import { API, fetchAI } from './online'

export type Facts = Record<string, unknown> & { letter_type?: string | null }

export type ReaderAResult = {
  facts: Facts
  // How many private details were blanked before sending.
  redacted: Record<string, number>
}

// Give up after this long, so a slow connection does not freeze the screen.
const TIMEOUT_MS = 45_000

// onWaking: the AI server is still waking up (online.ts), so it will take longer.
export async function askReaderA(ocrText: string, onWaking?: () => void): Promise<ReaderAResult | null> {
  const { text, counts } = redact(ocrText)
  try {
    const response = await fetchAI(
      `${API}/extract`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) },
      { timeout: TIMEOUT_MS, onWaking },
    )
    if (!response.ok) return null
    const body = await response.json()
    return { facts: body.facts, redacted: counts }
  } catch (error) {
    console.warn('Reader A unavailable:', error)
    return null
  }
}

export type Explanation = { explanation: string; urgency: string }

// Asks the backend for a plain-language explanation of the confirmed facts,
// using Neil's prompt (prompts/explain.md). The backend throws away any
// explanation that mentions a date that is not in the facts. Returns null if
// it could not get a safe one.
export async function askForExplanation(
  facts: Record<string, unknown>,
  language: 'english' | 'spanish'
): Promise<Explanation | null> {
  try {
    const response = await fetchAI(
      `${API}/explain`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts, language }) },
      { timeout: TIMEOUT_MS },
    )
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.warn('Explanation unavailable:', error)
    return null
  }
}

export type Drafts = { rescission_letter: string; hearing_reason: string }

// Asks the backend to write the letter to the county and the hearing reason,
// from Neil's prompt (prompts/draft.md). Only used when one of Neil's
// county-mistake rules found something. The backend throws away any draft
// with a date that is not in the facts or the timeline.
export async function askForDrafts(
  facts: Record<string, unknown>,
  findings: unknown[],
  timeline: { date: string; type: string; description: string }[]
): Promise<Drafts | null> {
  try {
    const response = await fetchAI(
      `${API}/draft`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only the date, kind and note of each event. Who did it and the proof
        // file names stay on the phone.
        body: JSON.stringify({
          facts: { ...facts, case_number: null },
          findings,
          timeline: timeline.map(({ date, type, description }) => ({ date, type, description: redact(description).text })),
        }),
      },
      { timeout: TIMEOUT_MS },
    )
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.warn('Drafts unavailable:', error)
    return null
  }
}
