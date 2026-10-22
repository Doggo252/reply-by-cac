// Reads the words off a photo, on the phone itself.
//
// OCR means "optical character recognition": turning a picture of text into
// actual text. This uses Tesseract.js. All of its files are served by this
// app (see scripts/copy-ocr-files.mjs), so it works with no internet and the
// photo never leaves the phone.
import { createWorker, PSM } from 'tesseract.js'
import { prepareImage } from './image'

export type OcrResult = {
  text: string
  // How sure the reader is about the whole page, from 0 to 100.
  confidence: number
}

// 'page' reads the photo like a page of text. 'clean' takes the shadows out
// first (image.ts). 'sparse' also looks for bits of text anywhere on the
// photo instead of tidy lines, which suits a card on a table, but it splits
// "Ending balance $2,312.45" into two lines, so it is the last try.
export type ReadMode = 'page' | 'clean' | 'sparse'

// onProgress gets a number from 0 to 1 while the reading happens.
export async function readText(image: Blob, onProgress: (done: number) => void, mode: ReadMode = 'page'): Promise<OcrResult> {
  // Every photo is turned the right way up and resized first.
  const prepared = await prepareImage(image, mode !== 'page')
  const worker = await createWorker('eng', 1, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract',
    langPath: '/tesseract/lang',
    logger: (message) => {
      if (message.status === 'recognizing text') onProgress(message.progress)
    },
  })
  try {
    if (mode === 'sparse') await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    const result = await worker.recognize(prepared)
    return { text: result.data.text, confidence: result.data.confidence }
  } finally {
    // The reader uses a lot of memory, so shut it down when done.
    await worker.terminate()
  }
}

// Reads a photo of one of the person's papers. If a reading doesn't find
// what we need (`found`), or fails, it tries the next way, up to three, and
// keeps the words from every try (one try may get the bank's name, another
// the balance). In Mom's Oct 21 test, the bank statement and the Medicare
// card both failed the first time and worked when she took them again.
export async function readPaper(image: Blob, found: (text: string) => boolean): Promise<OcrResult> {
  const read: OcrResult[] = []
  let lastError: unknown = null
  for (const mode of ['page', 'clean', 'sparse'] as const) {
    try {
      read.push(await readText(image, () => {}, mode))
    } catch (error) {
      console.error(error)
      lastError = error
      continue
    }
    if (found(read.map((r) => r.text).join('\n'))) break
  }
  if (read.length === 0) throw lastError
  return { text: read.map((r) => r.text).join('\n'), confidence: Math.max(...read.map((r) => r.confidence)) }
}
