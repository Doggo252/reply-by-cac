// The papers for a reply, shared by both ways of making one: step by step
// (ReplyPacket.tsx) and with the AI helper (AgentHelper.tsx). Both go through
// the same screens (PaperSteps.tsx), so the person is asked the same
// questions and the reply says the same thing, whichever way they came in.
import { useEffect, useState } from 'react'
import type { PaperAnswer } from './PaperSteps'
import { helpFor } from './paperHelp'
import { whatToSend } from './letterJob'
import { listPapers, type Paper, type SavedLetter } from './storage'

// For a renewal, the form itself goes in the envelope on paper. These are the
// proof papers that go with it.
export const RENEWAL_PHOTOS = ['Proof of income, like a Social Security letter', 'Your newest bank statement']

export function usePapers(letter: SavedLetter) {
  // A request for papers (MC 355) lists them as checked boxes on page 2, so
  // the person picks them first. null: not picked yet.
  const [pickedBoxes, setPickedBoxes] = useState<string[] | null>(null)
  const [answers, setAnswers] = useState<Record<string, PaperAnswer>>({})
  const [renewalPart, setRenewalPart] = useState<number | 'ask' | 'done'>('ask')
  const [papers, setPapers] = useState<Paper[]>([]) // everything saved in My papers
  const [chosen, setChosen] = useState<string[]>([]) // the photos going in the reply

  useEffect(() => {
    listPapers().then(setPapers).catch(() => setPapers([]))
  }, [])

  const { letterType } = letter
  // What the county asked for, as listed on the cover letter.
  const toSend = letterType === 'MC355' ? (pickedBoxes ?? []) : whatToSend(letterType, letter.facts.ask ?? null)
  // The papers to go through one at a time.
  const photoItems = letterType === 'MC210_RV' ? RENEWAL_PHOTOS : letterType === 'MC355' ? pickedBoxes : toSend
  // "I don't have one" answers become plain sentences on the cover letter.
  const statements = (photoItems ?? []).filter((item) => answers[item] === 'none').map((item) => helpFor(item).noneLine!)
  const later = (photoItems ?? []).filter((item) => answers[item] === 'later')
  // What goes in the envelope, for the cover letter's "I am including" list:
  // everything asked for except what the person doesn't have or will send
  // later. For a renewal, the two forms, then the proof papers.
  const skipped = (item: string) => answers[item] === 'none' || answers[item] === 'later'
  const included =
    letterType === 'MC210_RV'
      ? [...toSend.filter((item) => !item.startsWith('Proof')), ...RENEWAL_PHOTOS.filter((item) => !skipped(item))]
      : toSend.filter((item) => !skipped(item))

  function setAnswer(item: string, answer: PaperAnswer | null) {
    setAnswers((old) => {
      const next = { ...old }
      if (answer) next[item] = answer
      else delete next[item]
      return next
    })
    // Not a photo any more: take that paper's photo out of the reply.
    if (answer !== 'photo') {
      setChosen((old) => old.filter((id) => papers.find((p) => p.id === id)?.name !== item))
    }
  }

  // A photo the AI helper asked for, taken on its photo screen.
  async function addPhoto(item: string, paperId: string) {
    setPapers(await listPapers())
    setChosen((old) => (old.includes(paperId) ? old : [...old, paperId]))
    setAnswers((old) => ({ ...old, [item]: 'photo' }))
  }

  // Everything PaperSteps needs.
  const stepsProps = {
    letterType,
    items: photoItems,
    onItems: setPickedBoxes,
    answers,
    onAnswer: setAnswer,
    papers,
    chosen,
    onChosen: setChosen,
    onPapersChanged: setPapers,
    renewalPart,
    onRenewalPart: (part: number | 'ask' | 'done') => {
      setRenewalPart(part)
      window.scrollTo(0, 0)
    },
  }

  return { toSend, included, photoItems, statements, later, answers, papers, setPapers, chosen, setChosen, addPhoto, stepsProps }
}
