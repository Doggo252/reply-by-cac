// Gets a photo ready for text reading (OCR).
//
// Every photo is resized so its longest side is READ_SIDE pixels: big phone
// photos are shrunk (the text reader gets very slow on huge pictures) and
// small ones are blown up (the text reader misreads small print). Tested on
// 60 fake letters on Oct 18: at 3000 pixels it found the worker's phone
// number on 51, at 2200 on 47. The photo never leaves the phone.

// Longest side, in pixels, of the picture handed to the text reader.
export const READ_SIDE = 3000

// The new width and height so the longest side is exactly `side`, keeping
// the same shape.
export function sizeForReading(width: number, height: number, side: number) {
  const scale = side / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

// Resizes the photo and returns it as a JPEG.
export async function prepareImage(file: Blob): Promise<Blob> {
  // createImageBitmap also turns the photo the right way up, using the
  // rotation note the phone camera saved with it.
  const bitmap = await createImageBitmap(file)
  const { width, height } = sizeForReading(bitmap.width, bitmap.height, READ_SIDE)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  // Smooth resizing, so blown-up letters stay readable instead of blocky.
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process the photo.'))),
      'image/jpeg',
      0.9
    )
  })
}
