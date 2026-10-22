// The tip under every "take a photo" button. In Mom's Oct 21 test, every
// photo had the phone's shadow across the paper.
import { t } from './language'

export default function PhotoTip() {
  return <p className="hint">{t("Tip: lay it flat in good light, keep your phone's shadow off it, and fill the screen with the paper.")}</p>
}
