// The app's language, English or Spanish, picked on the very first screen.
//
// Every screen writes its words in plain English inside t('...'). When the
// person picked Spanish, t() looks the English sentence up in spanish.ts and
// returns the Spanish one. A sentence with no Spanish yet stays in English,
// so a screen is never blank.
//
// Words in {braces} are filled in: t('{n} days left', { n: 5 }).
//
// What goes to the county (the cover letter, the forms) always stays in
// English, because the county reads English.
import { SPANISH } from './spanish'

export type Language = 'en' | 'es'

const KEY = 'replyby-language'

function saved(): Language | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'en' || value === 'es' ? value : null
  } catch {
    return null
  }
}

let current: Language = saved() ?? 'en'

export const hasChosenLanguage = () => saved() !== null
export const getLanguage = () => current

export function setLanguage(language: Language) {
  current = language
  try {
    localStorage.setItem(KEY, language)
  } catch {
    // Not saved; the app asks again next time.
  }
  document.documentElement.lang = language
}

// The locale for dates in words ("October 5, 2026" or "5 de octubre de 2026").
export const locale = () => (current === 'es' ? 'es-US' : 'en-US')

export function t(english: string, words: Record<string, string | number> = {}): string {
  const text = current === 'es' ? (SPANISH[english] ?? english) : english
  return text.replace(/\{(\w+)\}/g, (match: string, name: string) => (name in words ? String(words[name]) : match))
}
