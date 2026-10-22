// Gets a photo ready for text reading (OCR), and for the reply packet.
//
// Every photo is resized so its longest side is READ_SIDE pixels: big phone
// photos are shrunk (the text reader gets very slow on huge pictures) and
// small ones are blown up (the text reader misreads small print). Tested on
// 60 fake letters on Oct 18: at 3000 pixels it found the worker's phone
// number on 51, at 2200 on 47. The photo never leaves the phone.

// Longest side, in pixels, of the picture handed to the text reader.
export const READ_SIDE = 3000

// Longest side of a photo put in the reply packet: sharp when printed, and
// small enough that the packet can be emailed.
export const PACKET_SIDE = 2000

// The new width and height so the longest side is exactly `side`, keeping
// the same shape.
export function sizeForReading(width: number, height: number, side: number) {
  const scale = side / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

// Draws the photo the right way up at the given longest side. Phones save
// most photos sideways with a note saying which way to turn them;
// createImageBitmap follows that note. (pdf-lib does not, which is why the
// photos in Mom's Oct 21 packet came out sideways.)
async function drawUpright(file: Blob, side: number) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { width, height } = sizeForReading(bitmap.width, bitmap.height, side)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  // Smooth resizing, so blown-up letters stay readable instead of blocky.
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return { canvas, context, width, height }
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process the photo.'))), 'image/jpeg', quality)
  })

// The second try on a hard photo: gray, with shadows taken out, so the text
// stands out evenly across the page. Each pixel is divided by the light
// around it, taken from a very blurry copy of the photo (shrunk, then grown
// back). A phone's shadow over half the page no longer hides the text there.
function flattenLight(context: CanvasRenderingContext2D, width: number, height: number) {
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.round(width / 24))
  small.height = Math.max(1, Math.round(height / 24))
  small.getContext('2d')!.drawImage(context.canvas, 0, 0, small.width, small.height)
  const light = document.createElement('canvas')
  light.width = width
  light.height = height
  const lightContext = light.getContext('2d')!
  lightContext.imageSmoothingQuality = 'high'
  lightContext.drawImage(small, 0, 0, width, height)

  const photo = context.getImageData(0, 0, width, height)
  const glow = lightContext.getImageData(0, 0, width, height).data
  const pixels = photo.data
  const gray = (data: Uint8ClampedArray, i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  for (let i = 0; i < pixels.length; i += 4) {
    const value = Math.min(255, (gray(pixels, i) / Math.max(gray(glow, i), 1)) * 240)
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value
  }
  context.putImageData(photo, 0, 0)
}

// The photo for the text reader: upright, resized, and for the second try
// (`hard`), with the shadows taken out.
export async function prepareImage(file: Blob, hard = false): Promise<Blob> {
  const { canvas, context, width, height } = await drawUpright(file, READ_SIDE)
  if (hard) flattenLight(context, width, height)
  return toJpeg(canvas, 0.9)
}

// The photo for the reply packet: upright and not too big.
export async function photoForPacket(file: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const side = Math.min(PACKET_SIDE, Math.max(bitmap.width, bitmap.height))
  bitmap.close()
  const { canvas } = await drawUpright(file, side)
  return new Uint8Array(await (await toJpeg(canvas, 0.85)).arrayBuffer())
}
