// Service worker: the small script the browser keeps after the page closes.
// Its whole job here is to save a copy of the app's files so ReplyBy still
// opens with no internet. It never caches anything from the backend, because
// deadlines and letters must always come from fresh data, not a stale copy.
//
// Bump CACHE_NAME whenever the app's files change, so old copies get thrown out.
const CACHE_NAME = 'replyby-v8'

// Cache the shell on install: the page itself, the logo and icons, the
// official forms, so the reply packet can be made with no internet, and the
// sample letter, so it can be tried offline too.
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest', '/logo.svg', '/icon-192.png', '/icon-512.png',
  '/forms/hearing-request.pdf', '/forms/mc210rv-signature-page.pdf', '/forms/mc210rv.pdf',
  '/sample-letter.jpg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)))
  // Don't wait for the old worker to close before taking over.
  self.skipWaiting()
})

// On activate, delete caches left over from older versions of the app.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  // Only handle plain page and asset loads from this app. Anything else, such
  // as a POST to the backend, goes straight to the network untouched.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // A navigation is the user opening the app. Try the network first so they get
  // the newest version, and fall back to the saved page when offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')))
    return
  }

  // Everything else (scripts, styles, icons): use the saved copy if there is
  // one, otherwise fetch it and save it for next time.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        // Only save real, complete responses.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
    })
  )
})
