// Everything the app keeps on the phone. Nothing here is ever sent anywhere.
//
//   papers   the receipt vault: photos and files, each with its fingerprint
//   events   the timeline: things that happened, in Neil's event shape
//   letter   the letter the user is working on (small, so localStorage)
//
// The papers and events live in IndexedDB, the browser's database, because
// photos are too big for localStorage.
import type { TimelineEvent } from './contradictions'
import { fingerprint } from './fingerprint'
import type { ReadingMode } from './flags'
import type { AboutYou } from './packet'

export type Paper = {
  id: string
  name: string
  type: string // like "image/jpeg" or "application/pdf"
  size: number // bytes
  addedAt: string // when it was saved, as an ISO date and time
  sha256: string // the fingerprint, saved the moment the file was added
  file: Blob
}

export type SavedEvent = TimelineEvent & { id: string }

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('replyby', 1)
    // Runs the first time only: makes the two tables.
    request.onupgradeneeded = () => {
      request.result.createObjectStore('papers', { keyPath: 'id' })
      request.result.createObjectStore('events', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Runs one read or write on a table and waits for it to finish.
async function use<T>(table: 'papers' | 'events', write: boolean, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const request = action(db.transaction(table, write ? 'readwrite' : 'readonly').objectStore(table))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// The vault --------------------------------------------------------------------

export async function addPaper(file: Blob, name: string): Promise<Paper> {
  const paper: Paper = {
    id: newId(),
    name,
    type: file.type,
    size: file.size,
    addedAt: new Date().toISOString(),
    sha256: await fingerprint(file),
    file,
  }
  await use('papers', true, (s) => s.add(paper))
  return paper
}

export async function listPapers(): Promise<Paper[]> {
  const papers = await use<Paper[]>('papers', false, (s) => s.getAll())
  return papers.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
}

export const removePaper = (id: string) => use('papers', true, (s) => s.delete(id))

// The timeline -----------------------------------------------------------------

export async function addEvent(event: TimelineEvent): Promise<SavedEvent> {
  const saved = { ...event, id: newId() }
  await use('events', true, (s) => s.add(saved))
  return saved
}

export async function listEvents(): Promise<SavedEvent[]> {
  const events = await use<SavedEvent[]>('events', false, (s) => s.getAll())
  return events.sort((a, b) => a.date.localeCompare(b.date))
}

export const removeEvent = (id: string) => use('events', true, (s) => s.delete(id))

// The letter -------------------------------------------------------------------

export type SavedLetter = {
  letterType: string
  facts: Record<string, string | null>
  mode: ReadingMode
  // The words read off the photo, for the AI helper (it blanks private
  // details before anything is sent). Letters saved before Oct 17 have none.
  text?: string
  savedAt?: string
}

// localStorage can be blocked (private browsing), so every use is wrapped
// and the app still works, it just forgets on reload.
function load<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(key)
    return text ? (JSON.parse(text) as T) : null
  } catch {
    return null
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not saved. Nothing else to do.
  }
}

export const loadLetter = () => load<SavedLetter>('replyby-letter')
export const saveLetter = (letter: SavedLetter | null) => save('replyby-letter', letter)

// The AI helper's action log from its last run (TOOLS.md, Section 6). IDs and
// fixed words only, never text. The person can read it in My papers and delete it.
export const loadHelperLog = () => load<string[]>('replyby-helper-log')
export const saveHelperLog = (lines: string[] | null) => save('replyby-helper-log', lines)

// Deadlines the person told the watcher they already took care of, for one letter.
type Done = { letter: string; ids: string[] }
export function loadDone(letter: string): string[] {
  const done = load<Done>('replyby-done')
  return done && done.letter === letter ? done.ids : []
}
export const saveDone = (letter: string, ids: string[]) => save('replyby-done', { letter, ids })

// The drafts the AI wrote from Neil's draft prompt, kept for the packet.
export type SavedDrafts = { rescission_letter: string; hearing_reason: string }
export const loadDrafts = () => load<SavedDrafts>('replyby-drafts')
export const saveDrafts = (drafts: SavedDrafts | null) => save('replyby-drafts', drafts)

// The person's name and address, for the forms. Only ever kept on this phone.
export const loadAbout = () => load<AboutYou>('replyby-about')
export const saveAbout = (about: AboutYou) => save('replyby-about', about)

// The reading choice is saved as plain text, as it always has been.
export function loadMode(): ReadingMode | null {
  try {
    const mode = localStorage.getItem('replyby-reading-mode')
    return mode === 'ai' || mode === 'phone' ? mode : null
  } catch {
    return null
  }
}
export function saveMode(mode: ReadingMode) {
  try {
    localStorage.setItem('replyby-reading-mode', mode)
  } catch {
    // Not saved; the user will be asked again next time.
  }
}

// Saves a changed event over the old one (used to attach proof later).
export const updateEvent = (event: SavedEvent) => use('events', true, (s) => s.put(event))
