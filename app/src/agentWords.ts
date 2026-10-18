// Plain words for the AI helper's screens. Kept apart from the screen itself
// so they can be tested.
import type { LogLine } from './agentLoop'
import type { Draft } from './agentTools'

// What each tool is doing, in words a person reads on the live log.
const DOING: Record<string, string> = {
  get_letter: 'Reading your letter',
  get_timeline: 'Looking at what you wrote down',
  list_papers: 'Looking at the papers you saved',
  get_paper_text: 'Reading one of your papers',
  request_photo: 'Asking you for a photo',
  check_county_mistake: 'Checking if the county made a mistake',
  draft_hearing_request: 'Writing your hearing request',
  draft_restore_letter: 'Writing a letter asking the county to fix their mistake',
  propose_packet: 'Putting your reply together',
  run_checker: 'Making sure your reply matches your letter',
  open_review_screen: 'Showing you your reply',
  ask_user_to_sign: 'Asking you to sign',
  build_packet: 'Making your final reply',
}

// One log line, in plain words: "✓ Reading your letter".
export function logWords(line: LogLine): string {
  const doing = DOING[line.tool] ?? (line.tool === '(stop)' ? 'Stopped' : `Tried "${line.tool}"`)
  if (line.outcome === 'ok') return `✓ ${doing}`
  if (line.outcome === 'stop') return `■ ${doing}: stopped`
  if (line.reason === 'cancelled' || line.reason === 'declined') return `${doing}: you said not now`
  return `↻ ${doing}: that didn't work, trying another way`
}

// TOOLS.md, Section 6: the exact line the spec asks for.
export function logRecord(line: LogLine): string {
  return [line.time.slice(11, 19), line.tool, line.inputs || '-', line.outcome, line.reason || '-', `v${line.version ?? '-'}`].join(' | ')
}

// The body of the restore letter from the AI helper's draft. The code adds
// the law from Neil's county-mistake rules; the header (to, from, case
// number, date) is added by buildPacket.
export function restoreLetterBody(draft: Draft): string {
  const parts = ['I am asking you to restore my Medi-Cal.']
  if (draft.reason.trim()) parts.push(draft.reason.trim())
  if (draft.citation) parts.push(`This is required by ${draft.citation}.`)
  parts.push('Thank you.')
  return parts.join('\n\n')
}

// The AI names the paper it wants in its own words ("Insurance policy"). The
// photo is saved under the matching line of the checklist ("Life insurance
// policy"), so the checklist shows it as done. No good match: the AI's words.
export function closestItem(asked: string, items: string[]): string {
  const words = (text: string) => new Set(text.toLowerCase().match(/[a-z]{4,}/g) ?? [])
  const wanted = words(asked)
  let best = { item: asked, shared: 0 }
  for (const item of items) {
    const shared = [...words(item)].filter((w) => wanted.has(w)).length
    if (shared > best.shared) best = { item, shared }
  }
  return best.item
}

// One short ID per letter, so the helper's packet stays tied to the letter it
// was for. The app holds one letter at a time, so the type and the day it was
// saved are enough: "letter-MC_239A-1017".
export function letterId(letter: { letterType: string; facts: Record<string, string | null>; savedAt?: string }): string {
  const day = (letter.savedAt ?? letter.facts.notice_date ?? '').slice(5, 10).replace('-', '')
  return `letter-${letter.letterType}${day ? `-${day}` : ''}`
}
