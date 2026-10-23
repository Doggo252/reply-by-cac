// Waiting for the AI server to wake up (online.ts). From Neil's Oct 22 test:
// the sleeping Render server answered "503" and the app gave up on the AI.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAI } from './online'

const page = (status: number) => new Response('<html>Application loading</html>', { status, headers: { 'content-type': 'text/html' } })
const json = (status: number) => new Response('{"detail":"x"}', { status, headers: { 'content-type': 'application/json' } })

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('calling the AI while its server wakes up', () => {
  it("tries again while Render says it's waking up, then gets the answer", async () => {
    vi.useFakeTimers()
    const answers = [page(503), page(503), json(200)]
    vi.stubGlobal('fetch', vi.fn(async () => answers.shift()!))
    const waking = vi.fn()
    const call = fetchAI('/api/extract', { method: 'POST' }, { timeout: 1000, onWaking: waking })
    await vi.advanceTimersByTimeAsync(10_000)
    expect((await call).status).toBe(200)
    expect(waking).toHaveBeenCalledTimes(2)
  })

  it("does not try again when our own server answers with an error (it already tried Gemini)", async () => {
    const fetch = vi.fn(async () => json(503))
    vi.stubGlobal('fetch', fetch)
    expect((await fetchAI('/api/extract', {}, { timeout: 1000 })).status).toBe(503)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
