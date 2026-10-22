// Draws each page of a PDF as a picture, on the phone, with pdf.js (Mozilla's
// PDF reader). Used to show the whole reply packet before the person signs.
// pdf.js is only loaded the first time it is needed, so the app still opens fast.

// Width of each page picture, in pixels: sharp enough to read on a phone
// when zoomed in, small enough for 20 pages.
const PAGE_WIDTH = 1000

export async function drawPages(pdf: Uint8Array, onPage: (done: number, total: number) => void): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  // pdf.js takes the bytes over, so it gets its own copy.
  const loading = pdfjs.getDocument({ data: pdf.slice() })
  const doc = await loading.promise
  const pictures: string[] = []
  try {
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number)
      const viewport = page.getViewport({ scale: PAGE_WIDTH / page.getViewport({ scale: 1 }).width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise
      pictures.push(canvas.toDataURL('image/jpeg', 0.85))
      onPage(number, doc.numPages)
    }
  } finally {
    await loading.destroy() // frees the memory pdf.js used
  }
  return pictures
}
