// The papers, one at a time. For each one the person sees what it is and
// where people usually find it, then picks one answer:
//   take a photo / I'll put the paper copy in / I don't have one / I can't find it
// A request for papers (MC 355) starts with "Which boxes are checked?", since
// the list is on page 2 and up. A renewal starts with an offer to walk
// through the form one part at a time.
// When every paper has an answer, it shows a summary, with `children` (the
// hearing and letter choices, and the Next button) under it.
import { useState } from 'react'
import { helpFor, MC355_BOXES } from './paperHelp'
import { addPaper, listPapers, type Paper } from './storage'
import { savedOn } from './words'

export type PaperAnswer = 'photo' | 'mail' | 'none' | 'later'

// The parts of the MC 210 RV, with page numbers on the October 2020 form. The
// property part matters again since 2026 (ACWDL 25-14).
const RENEWAL_PARTS = [
  ['Page 2: how to reach you', "Check your name, address and phone number. If they're right, tick the box that says so. If not, write in the new ones."],
  ['Pages 3 and 4: who lives with you', 'Make sure everyone who lives with you is listed. Cross out anyone who moved out, and add anyone new.'],
  ['Pages 5 to 7: your income', 'Write down the money you get each month, like Social Security, a pension or a job. You will take a photo of the proof at the end.'],
  ['Page 8: your costs', 'Write down costs the form asks about, like medical bills or care costs.'],
  ['Pages 9 and 10: money and things you own', 'List bank accounts, cars, and any house or land besides your home. The county asks about these again since 2026.'],
  ['The property form', 'Fill in the short property form that came with your renewal form too.'],
  ['Page 11: Medicare', 'If you have Medicare, write in your Medicare number. It is on your red, white and blue Medicare card.'],
  ['Pages 12 to 15: other questions', 'Read each question about long-term care, other health insurance and changes at home, and tick yes or no.'],
  ['Page 17: sign it', 'Sign and date page 17. We will also make a signed copy of this page for you at the end.'],
]

export default function PaperSteps(props: {
  letterType: string
  items: string[] | null // null: a request for papers, before the boxes are picked
  onItems: (items: string[]) => void
  answers: Record<string, PaperAnswer>
  onAnswer: (item: string, answer: PaperAnswer | null) => void
  papers: Paper[]
  chosen: string[]
  onChosen: (ids: string[]) => void
  onPapersChanged: (papers: Paper[]) => void
  renewalPart: number | 'ask' | 'done' // where the renewal walk-through is
  onRenewalPart: (part: number | 'ask' | 'done') => void
  children: React.ReactNode
}) {
  const { letterType, items, answers, onAnswer, papers, chosen, onChosen } = props
  const [cantFind, setCantFind] = useState(false)
  const [picked, setPicked] = useState<string[]>([])

  // 1. A request for papers: which boxes are checked?
  if (items === null) {
    return (
      <>
        <span className="step">Step 1 of 4</span>
        <h1 className="page-title">Which boxes are checked?</h1>
        <p className="lead">
          Turn to page 2 of your letter. The county put a check mark next to each thing they need. Tap the same ones
          here.
        </p>
        {MC355_BOXES.map((box) => {
          const on = picked.includes(box)
          return (
            <button key={box} className={`choice ${on ? 'on' : ''}`} onClick={() => setPicked(on ? picked.filter((b) => b !== box) : [...picked, box])}>
              <strong>
                {on ? '✓ ' : ''}
                {box}
              </strong>
            </button>
          )
        })}
        <button className="button primary" disabled={picked.length === 0} onClick={() => props.onItems(picked)}>
          {picked.length === 0 ? 'Tap the checked boxes first' : `Next: ${picked.length} ${picked.length === 1 ? 'paper' : 'papers'}`}
        </button>
        <p className="hint">Can't find the boxes, or something else is checked? Call your worker and ask what they need.</p>
      </>
    )
  }

  // 2. A renewal: offer to go through the form one part at a time.
  if (letterType === 'MC210_RV' && props.renewalPart !== 'done') {
    if (props.renewalPart === 'ask') {
      return (
        <>
          <span className="step">Step 1 of 4</span>
          <h1 className="page-title">Do you want help filling in your renewal form?</h1>
          <p className="lead">
            We'll go through the paper form with you, one part at a time. Have it in front of you, with a pen.
          </p>
          <button className="button primary big" onClick={() => props.onRenewalPart(0)}>
            Yes, go through it with me
          </button>
          <button className="button" onClick={() => props.onRenewalPart('done')}>
            No, I already filled it in
          </button>
        </>
      )
    }
    const part = props.renewalPart
    const [title, how] = RENEWAL_PARTS[part]
    return (
      <>
        <span className="step">
          Part {part + 1} of {RENEWAL_PARTS.length}
        </span>
        <h1 className="page-title">{title}</h1>
        <div className="card">
          <p>{how}</p>
        </div>
        <button
          className="button primary big"
          onClick={() => props.onRenewalPart(part + 1 < RENEWAL_PARTS.length ? part + 1 : 'done')}
        >
          {part + 1 < RENEWAL_PARTS.length ? 'Done, next part' : "Done, that's the form"}
        </button>
        <button className="link" onClick={() => props.onRenewalPart(part === 0 ? 'ask' : part - 1)}>
          Back
        </button>
      </>
    )
  }

  // 3. One paper at a time.
  const index = items.findIndex((item) => !answers[item])
  if (index >= 0) {
    const item = items[index]
    const help = helpFor(item)
    const earlier = papers
      .filter((p) => p.name === item)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))[0]
    const answer = (value: PaperAnswer) => {
      setCantFind(false)
      onAnswer(item, value)
      window.scrollTo(0, 0)
    }

    async function photo(file: File | undefined) {
      if (!file) return
      const paper = await addPaper(file, item)
      props.onPapersChanged(await listPapers())
      onChosen([...chosen.filter((id) => id !== earlier?.id), paper.id])
      answer('photo')
    }

    return (
      <>
        <span className="step">
          {letterType === 'MC210_RV' ? 'Proof' : 'Paper'} {index + 1} of {items.length}
        </span>
        <h1 className="page-title">{item}</h1>
        <div className="card">
          <p>
            <strong>What it is: </strong>
            {help.what}
          </p>
          <p>
            <strong>Where to find it: </strong>
            {help.where}
          </p>
        </div>

        {earlier && (
          <button
            className="button primary big"
            onClick={() => {
              if (!chosen.includes(earlier.id)) onChosen([...chosen, earlier.id])
              answer('photo')
            }}
          >
            Use the photo from {savedOn(earlier.addedAt)}
          </button>
        )}
        <label className={`button ${earlier ? '' : 'primary big'}`}>
          {earlier ? 'Take a new photo' : 'Take a photo of it'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              photo(file)
            }}
          />
        </label>
        <button className="button" onClick={() => answer('mail')}>
          I'll put the paper copy in the envelope
        </button>
        {help.noneLabel && (
          <button className="button" onClick={() => answer('none')}>
            {help.noneLabel}
          </button>
        )}
        {!cantFind ? (
          <button className="link" onClick={() => setCantFind(true)}>
            I can't find it right now
          </button>
        ) : (
          <div className="card">
            <p>That's okay. You can send everything else now, and send this one when you find it.</p>
            <p>You can also call your worker. They can sometimes look it up for you.</p>
            <button className="button" onClick={() => answer('later')}>
              Skip it for now
            </button>
          </div>
        )}
        {index > 0 && (
          <button className="link" onClick={() => onAnswer(items[index - 1], null)}>
            Back to the last paper
          </button>
        )}
      </>
    )
  }

  // 4. Every paper has an answer: show them all, with a way to change each.
  return (
    <>
      <span className="step">Step 1 of 4</span>
      <h1 className="page-title">Here are your papers</h1>
      <ul className="paper-list">
        {letterType === 'MC210_RV' && (
          // The form goes in the envelope on paper, so it is easy to forget.
          <li className="paper-row">
            <p className="paper-row-name">Your renewal form and the property form</p>
            <p className="small">✉ Put them in the envelope, filled in and signed</p>
            <button className="link" onClick={() => props.onRenewalPart('ask')}>
              Go through the form again
            </button>
          </li>
        )}
        {items.map((item) => (
          <li key={item} className={`paper-row ${answers[item] === 'photo' ? 'done' : ''}`}>
            <p className="paper-row-name">{item}</p>
            <p className="small">{ANSWER_WORDS[answers[item]]}</p>
            <button className="link" onClick={() => onAnswer(item, null)}>
              Change
            </button>
          </li>
        ))}
      </ul>
      {props.children}
    </>
  )
}

const ANSWER_WORDS: Record<PaperAnswer, string> = {
  photo: '✓ Photo added',
  mail: "✉ You'll put the paper copy in the envelope",
  none: "You'll tell them you don't have this",
  later: "You'll send this one later",
}
