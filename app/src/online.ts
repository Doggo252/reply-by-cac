// Whether the phone can reach the AI: is it online, and is the AI server awake.
import { useEffect, useState } from 'react'

// True while the phone is online. Changes when the connection does.
export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

// The free Render server goes to sleep after 15 minutes with no visitors and
// takes up to a minute to wake up. So in AI mode the app knocks on its door as
// soon as it opens, while the person is still taking the photo, and the AI is
// awake by the time the letter is read.
let knocked = false
export function wakeUpAI() {
  if (knocked || !navigator.onLine) return
  knocked = true
  fetch('/api/health', { signal: AbortSignal.timeout(90_000) }).catch(() => {
    knocked = false // try again next time
  })
}
