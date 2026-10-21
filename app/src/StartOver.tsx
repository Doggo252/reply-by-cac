// "Start over": one button that deletes everything on this phone and opens
// the app fresh, at the language screen. Handy for testing, and for anyone
// who wants a clean start.
import { resetEverything } from './storage'
import { t } from './language'

export default function StartOver() {
  async function startOver() {
    const ask = t('Start over? This deletes your letter, your answers and everything in My papers from this phone. It cannot be undone.')
    if (!window.confirm(ask)) return
    await resetEverything()
    window.location.reload()
  }
  return (
    <button className="link danger" onClick={startOver}>
      {t('Start over and delete everything')}
    </button>
  )
}
