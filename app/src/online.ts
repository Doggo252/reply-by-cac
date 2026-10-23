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
// takes up to a minute to wake up. While it wakes, Render itself answers every
// request at once with "503, try again" (a web page, not our backend's JSON).
// In Neil's Oct 22 test the AI reader took that as "no AI" and gave up, so
// only the phone read the letter. Now every AI call waits it out: it tries
// again every few seconds, for up to WAKE_LIMIT, and says so on the screen.
const WAKE_LIMIT = 90_000
const RETRY_EVERY = 4_000

// Render's "still waking up" answer: 502, 503 or 504, and not our JSON.
const stillWaking = (response: Response) =>
  [502, 503, 504].includes(response.status) && !(response.headers.get('content-type') ?? '').includes('application/json')

export async function fetchAI(
  url: string,
  init: RequestInit,
  { timeout, onWaking }: { timeout: number; onWaking?: () => void },
): Promise<Response> {
  const giveUpAt = Date.now() + WAKE_LIMIT
  for (;;) {
    let response: Response | null = null
    try {
      // Each try gets its own time limit.
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) })
    } catch (error) {
      // No internet at all: no point waiting.
      if (!navigator.onLine || Date.now() > giveUpAt) throw error
    }
    if (response && !stillWaking(response)) return response
    if (Date.now() > giveUpAt) {
      if (response) return response
      throw new Error('The AI server did not wake up.')
    }
    onWaking?.()
    await new Promise((wait) => setTimeout(wait, RETRY_EVERY))
  }
}

// In AI mode the app knocks on the server's door as soon as it opens, while
// the person is still taking the photo, so the AI is awake when it's needed.
let knocked = false
export function wakeUpAI() {
  if (knocked || !navigator.onLine) return
  knocked = true
  fetchAI('/api/health', {}, { timeout: 30_000 }).catch(() => {
    knocked = false // try again next time
  })
}
