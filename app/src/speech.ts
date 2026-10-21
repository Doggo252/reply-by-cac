// "Read it to me": the phone reads the screen out loud with its own built-in
// voice. Nothing is sent anywhere, and it works with no internet.
//
// The screen is read one line at a time, because some phones stop a long
// reading partway through.

export type Line = { text: string; lang: 'en-US' | 'es-US' }

// The lines to read, from the words on the screen. Marks like ✓ are dropped,
// since a voice would say "check mark". Each line gets the voice of the app's
// language (`base`), except lines in a part marked Spanish (the explanation in
// Spanish) or English (the letter to the county, which is always English).
export function linesToRead(
  screenText: string,
  spanishParts: string[] = [],
  englishParts: string[] = [],
  base: Line['lang'] = 'en-US',
): Line[] {
  const lines: Line[] = []
  for (const raw of screenText.split('\n')) {
    let text = raw.replace(/[✓✉•▶▼→←]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text || text === lines[lines.length - 1]?.text) continue
    // Some labels are in capitals on the screen. Read them as normal words.
    if (!/[a-z]/.test(text) && (text.match(/[A-Z]{4,}/g) ?? []).length >= 2) {
      text = text.charAt(0) + text.slice(1).toLowerCase()
    }
    const inPart = (parts: string[]) => parts.some((part) => part.includes(raw.trim()))
    lines.push({ text, lang: inPart(spanishParts) ? 'es-US' : inPart(englishParts) ? 'en-US' : base })
  }
  return lines
}

export function canReadAloud(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// Each reading gets a number, so a reading that was stopped can't call
// onDone after a new one has started.
let reading = 0

export function readAloud(lines: Line[], onDone: () => void) {
  speechSynthesis.cancel()
  const mine = ++reading
  if (lines.length === 0) return onDone()
  lines.forEach((line, i) => {
    const piece = new SpeechSynthesisUtterance(line.text)
    piece.lang = line.lang
    piece.rate = 0.9 // a little slower than normal
    if (i === lines.length - 1) piece.onend = () => mine === reading && onDone()
    speechSynthesis.speak(piece)
  })
}

export function stopReading() {
  reading++
  if (canReadAloud()) speechSynthesis.cancel()
}
