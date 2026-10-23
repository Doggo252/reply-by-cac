// The confirm screen: every fact the readers found, which the user can fix.
// Nothing after this (countdowns, explanation, forms) uses a fact until the
// user says it is right. Flagged facts are marked in yellow, by Neil's rules
// in flags.ts.
//
// When the scanner is not sure about a fact (it is empty or yellow), the
// screen offers what it did find on the letter as choices to tap: every date,
// phone number or case number in the text. One tap instead of typing.
import { useEffect, useRef, useState } from 'react'
import { fixCaseNumber } from './localFacts'
import { findCaseNumbers, findDates, findPhones } from './textFinds'
import { factLabel, inWords } from './words'
import { t } from './language'

const isDate = (field: string) => field.endsWith('_date')

type Props = {
  fields: string[]
  facts: Record<string, string | null>
  flags: Record<string, string>
  text?: string // the words read off the photo, for the choices
  photoUrl?: string | null // the photo, to look at it up close
  letterType?: string
  onConfirm: (facts: Record<string, string | null>) => void
}

// What the scanner found on the letter that could be this fact, at most 4.
// Case numbers are put back into the county's pattern first, so the choices
// are real case numbers, not garbled ones.
export function choicesFor(field: string, text: string): { value: string; label: string }[] {
  if (isDate(field)) return findDates(text).slice(0, 4).map((d) => ({ value: d, label: inWords(d, false) }))
  if (field === 'worker_phone') return findPhones(text).slice(0, 4).map((p) => ({ value: p, label: p }))
  if (field === 'case_number') {
    const fixed = findCaseNumbers(text).map(fixCaseNumber).filter((c): c is string => !!c)
    return [...new Set(fixed)].slice(0, 4).map((c) => ({ value: c, label: c }))
  }
  return []
}

// Where each fact usually is on the letter, in plain words.
export function whereToLook(field: string, letterType = ''): string {
  if (field === 'notice_date') return 'Near the top of your letter, after the words "Notice date".'
  if (field === 'due_date') {
    return letterType === 'MC210_RV'
      ? 'Near the top right, in the box that says "You may lose your Medi-Cal if you do not respond by".'
      : 'Look for the date they need your answer by, often after "Please send by" or "Due date".'
  }
  if (field === 'effective_date') return 'In the sentence that says your Medi-Cal "will be discontinued effective".'
  if (field === 'case_number') return 'Near the top, after the words "Case number". It has 7 letters and numbers.'
  if (field === 'worker_name') return 'Near the top, after the words "Worker name".'
  if (field === 'worker_phone') return 'Near the top, after the words "Worker telephone number".'
  if (field === 'ask') {
    return letterType === 'MC355'
      ? 'On page 2 and 3, next to the boxes with check marks.'
      : 'In the part that starts "The reason for this" or "You did not send".'
  }
  return ''
}

// Roughly where on the page each fact is: [left to right, top to bottom], 0 to 1.
// The dates, case number and worker are in the box at the top right of the
// county's letters; the reason is in the middle.
function spotFor(field: string): [number, number] {
  if (field === 'ask' || field === 'effective_date') return [0, 0.35]
  return [1, 0.1]
}

// The photo, bigger, in a box the person can drag around. It opens on the
// part of the letter where the fact usually is.
function Zoom({ src, spot }: { src: string; spot: [number, number] }) {
  const box = useRef<HTMLDivElement>(null)
  const place = () => {
    const b = box.current
    const img = b?.querySelector('img')
    if (!b || !img?.width) return
    b.scrollLeft = (img.width - b.clientWidth) * spot[0]
    b.scrollTop = Math.max(0, img.height * spot[1] - b.clientHeight / 3)
  }
  // Right away if the photo is already loaded, else when it loads.
  useEffect(place, [])
  return (
    <div className="zoom" ref={box} aria-label={t('Your letter, up close. Drag to move around.')}>
      <img src={src} alt={t('Your letter, up close')} onLoad={place} />
    </div>
  )
}

export default function Confirm({ fields, facts, flags, text = '', photoUrl, letterType, onConfirm }: Props) {
  // The fact whose part of the letter is shown up close.
  const [zoomed, setZoomed] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f, facts[f] ?? '']))
  )
  // A flag goes away once the user has looked at the fact and changed it.
  const [checked, setChecked] = useState<Set<string>>(new Set())

  function change(field: string, value: string) {
    setValues((old) => ({ ...old, [field]: value }))
    setChecked((old) => new Set(old).add(field))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    onConfirm(Object.fromEntries(fields.map((f) => [f, values[f].trim() || null])))
  }

  const flaggedCount = fields.filter((f) => flags[f] && !checked.has(f)).length

  return (
    <form className="card" onSubmit={submit}>
      <h2>{t('Is this right?')}</h2>
      <p>{t('Look at your letter and check each one. If something is wrong, tap it and fix it.')}</p>
      {flaggedCount > 0 && (
        <p className="fact-flag">
          {flaggedCount === 1 ? t('Please check the yellow box.') : t('Please check the {n} yellow boxes.', { n: flaggedCount })}
        </p>
      )}
      {fields.map((field) => {
        // The yellow goes away once the person changes the fact...
        const flag = !checked.has(field) ? flags[field] : undefined
        // ...but the help stays: where to look, the letter up close, and the
        // choices. (Oct 22: it used to vanish at the first letter typed.)
        const helped = !!flags[field]
        // Choices only where the scanner was not sure, and only other values.
        const choices = helped ? choicesFor(field, text).filter((c) => c.value !== values[field]) : []
        return (
          <div key={field} className={`fact ${flag ? 'flagged' : ''}`}>
            <label>
              <span className="fact-label">{factLabel(field)}</span>
              <input
                type={isDate(field) ? 'date' : 'text'}
                value={values[field]}
                onChange={(event) => change(field, event.target.value)}
                inputMode={field === 'worker_phone' ? 'tel' : undefined}
              />
            </label>
            {flag && <span className="fact-flag">{t(flag)}</span>}
            {helped && whereToLook(field, letterType) && (
              <p className="small">
                <strong>{t('Where to look:')} </strong>
                {t(whereToLook(field, letterType))}
              </p>
            )}
            {helped && photoUrl && (
              <>
                <button type="button" className="link" onClick={() => setZoomed(zoomed === field ? null : field)}>
                  {zoomed === field ? t('Hide my letter') : t('See my letter up close')}
                </button>
                {zoomed === field && <Zoom src={photoUrl} spot={spotFor(field)} />}
              </>
            )}
            {choices.length > 0 && (
              <div className="choices-found">
                <span className="small">{t('Is it one of these? We found them on your letter:')}</span>
                <div className="chips">
                  {choices.map((c) => (
                    <button type="button" key={c.value} className="chip" onClick={() => change(field, c.value)}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
      <button type="submit" className="button primary">
        {t('Yes, it all looks right')}
      </button>
    </form>
  )
}
