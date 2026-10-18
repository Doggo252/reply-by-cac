// The "Read it to me" button at the top of every screen. Tap it and the phone
// reads the screen out loud. Tap anything else and it stops, so it never goes
// on reading a screen that is gone.
import { useEffect, useState } from 'react'
import { canReadAloud, linesToRead, readAloud, stopReading } from './speech'

export default function ReadAloud() {
  const [reading, setReading] = useState(false)

  useEffect(() => {
    if (!reading) return
    const stop = (event: Event) => {
      if ((event.target as Element).closest?.('.read-aloud')) return
      stopReading()
      setReading(false)
    }
    document.addEventListener('click', stop, true)
    return () => document.removeEventListener('click', stop, true)
  }, [reading])

  // Stop the voice if the app closes.
  useEffect(() => stopReading, [])

  if (!canReadAloud()) return null

  function start() {
    const screen = document.querySelector('main')
    if (!screen) return
    // Everything on the screen except this top line.
    const parts = [...screen.children].filter((part) => !part.classList.contains('top-bar')) as HTMLElement[]
    const spanish = [...screen.querySelectorAll<HTMLElement>('[lang="es"]')].map((part) => part.innerText)
    setReading(true)
    readAloud(linesToRead(parts.map((part) => part.innerText).join('\n'), spanish), () => setReading(false))
  }

  function stop() {
    stopReading()
    setReading(false)
  }

  return (
    <button className="read-aloud" onClick={reading ? stop : start} aria-pressed={reading}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {reading ? (
          <rect x="7" y="7" width="10" height="10" rx="1" />
        ) : (
          <>
            <path d="M4 9h4l5-4v14l-5-4H4z" strokeLinejoin="round" />
            <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" strokeLinecap="round" />
          </>
        )}
      </svg>
      {reading ? 'Stop' : 'Read it to me'}
    </button>
  )
}
