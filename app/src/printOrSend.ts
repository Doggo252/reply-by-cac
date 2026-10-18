// Opens the phone's share sheet for a saved paper: Print, Mail, Messages and
// Files are all there. On an iPhone a saved file cannot open in a new browser
// tab (Safari shows an error), so the app never tries that. On a computer
// with no share sheet, the file is downloaded instead.
import type { Paper } from './storage'

export async function printOrSend(paper: Paper) {
  const type = paper.type || 'application/pdf'
  const file = new File([paper.file], paper.name, { type })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: paper.name }).catch(() => {})
    return
  }
  const url = URL.createObjectURL(paper.file)
  const link = document.createElement('a')
  link.href = url
  link.download = paper.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
