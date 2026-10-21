// Sign with a finger. Draws on a canvas and hands back the signature as a
// PNG (transparent background, dark blue ink) for the forms.
import { useEffect, useRef, useState } from 'react'
import { t } from './language'

const INK = '#13235b'

export default function SignaturePad({ onChange }: { onChange: (png: Uint8Array | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  // The box around the ink, so the saved signature is cropped to just the
  // writing and fills the signature line on the form.
  const inked = useRef<{ left: number; top: number; right: number; bottom: number } | null>(null)
  const [signed, setSigned] = useState(false)

  // Match the canvas to its size on screen, so lines are sharp, not blurry.
  useEffect(() => {
    const c = canvas.current!
    const scale = window.devicePixelRatio || 1
    c.width = c.clientWidth * scale
    c.height = c.clientHeight * scale
    const pen = c.getContext('2d')!
    pen.scale(scale, scale)
    pen.lineWidth = 3
    pen.lineCap = 'round'
    pen.lineJoin = 'round'
    pen.strokeStyle = INK
  }, [])

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const box = canvas.current!.getBoundingClientRect()
    const x = event.clientX - box.left
    const y = event.clientY - box.top
    const b = inked.current
    inked.current = b
      ? { left: Math.min(b.left, x), top: Math.min(b.top, y), right: Math.max(b.right, x), bottom: Math.max(b.bottom, y) }
      : { left: x, top: y, right: x, bottom: y }
    return [x, y] as const
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    canvas.current!.setPointerCapture(event.pointerId)
    drawing.current = true
    const pen = canvas.current!.getContext('2d')!
    const [x, y] = point(event)
    pen.beginPath()
    pen.moveTo(x, y)
    pen.lineTo(x + 0.1, y + 0.1) // a tap still leaves a dot
    pen.stroke()
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const pen = canvas.current!.getContext('2d')!
    const [x, y] = point(event)
    pen.lineTo(x, y)
    pen.stroke()
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    setSigned(true)
    // Copy just the inked part (plus a little room) to a new canvas.
    const c = canvas.current!
    const scale = c.width / c.clientWidth
    const b = inked.current!
    const pad = 6
    const left = Math.max(0, (b.left - pad) * scale)
    const top = Math.max(0, (b.top - pad) * scale)
    const width = Math.min(c.width - left, (b.right - b.left + 2 * pad) * scale)
    const height = Math.min(c.height - top, (b.bottom - b.top + 2 * pad) * scale)
    const cropped = document.createElement('canvas')
    cropped.width = Math.max(1, Math.round(width))
    cropped.height = Math.max(1, Math.round(height))
    cropped.getContext('2d')!.drawImage(c, left, top, width, height, 0, 0, cropped.width, cropped.height)
    cropped.toBlob(async (blob) => {
      if (blob) onChange(new Uint8Array(await blob.arrayBuffer()))
    }, 'image/png')
  }

  function clear() {
    const c = canvas.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    inked.current = null
    setSigned(false)
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={canvas}
        className="signature-pad"
        aria-label={t('Sign here with your finger')}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <div className="signature-bottom">
        <span className="small">{signed ? t('Signed') : t('Sign above with your finger')}</span>
        <button type="button" className="link" onClick={clear} disabled={!signed}>
          {t('Clear')}
        </button>
      </div>
    </div>
  )
}
