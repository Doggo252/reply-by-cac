// The papers for a reply, shared by both ways of making one: step by step
// (ReplyPacket.tsx) and with the AI helper (AgentHelper.tsx). Both go through
// the same screens (PaperSteps.tsx), so the person is asked the same
// questions and the reply says the same thing, whichever way they came in.
//
// Everything here is saved after every answer (storage.ts, "Progress"), so
// closing the app or tapping back by mistake loses nothing.
import { useEffect, useState } from 'react'
import type { PaperAnswer } from './PaperSteps'
import { helpFor } from './paperHelp'
import { whatToSend } from './letterJob'
import { letterKey, listPapers, loadProgress, saveProgress, type Paper, type SavedLetter } from './storage'
import { PARENT, PROOF_PAPERS, renewalPapers, type RenewalAnswers } from './renewalForm'
import type { RenewalProps } from './RenewalQuestions'

// The renewal form, as it is listed in the reply. The app fills it in.
export const RENEWAL_FORM = 'Your renewal form (MC 210 RV), filled in and signed'

// A paper on the county's list that the app's filled-in form takes care of.
const coveredByForm = (item: string) => /renewal form|mc ?210|^proof for the form/i.test(item)

// The photos going in the reply: the newest one of each paper, and never the
// Medicare card (it is only read for its number, which goes on the form).
export function onePerPaper(ids: string[], all: Paper[]): string[] {
  const newest = new Map<string, Paper>()
  for (const paper of all.filter((p) => ids.includes(p.id) && p.name !== PROOF_PAPERS.medicare_card)) {
    const kept = newest.get(paper.name)
    if (!kept || paper.addedAt > kept.addedAt) newest.set(paper.name, paper)
  }
  return ids.filter((id) => [...newest.values()].some((p) => p.id === id))
}

// The photos the AI picked that may go in: a paper on this reply's list, or
// one taken since this letter was read (like a mail receipt). A photo saved
// for an older letter, under another name, stays out.
export function allowedPicks(ids: string[], all: Paper[], list: string[], since = ''): string[] {
  return ids.filter((id) => {
    const paper = all.find((p) => p.id === id)
    return !!paper && (list.includes(paper.name) || paper.addedAt >= since)
  })
}

// Letters that need the renewal form filled in: a renewal, or a stop letter
// whose missing paper is the renewal form.
export function needsRenewalForm(letterType: string, asked: string[]): boolean {
  return letterType === 'MC210_RV' || (letterType === 'MC_239A' && asked.some((item) => /renewal form|mc ?210/i.test(item)))
}

export function usePapers(letter: SavedLetter) {
  // Where the person got to last time, for this letter.
  const [start] = useState(() => loadProgress(letter))
  // A request for papers (MC 355) lists them as checked boxes on page 2, so
  // the person picks them first. null: not picked yet.
  const [pickedBoxes, setPickedBoxes] = useState<string[] | null>(start?.pickedBoxes ?? null)
  const [answers, setAnswers] = useState<Record<string, PaperAnswer>>((start?.answers ?? {}) as Record<string, PaperAnswer>)
  const [renewal, setRenewal] = useState<RenewalAnswers>(start?.renewal ?? {})
  const [renewalStep, setRenewalStep] = useState(start?.renewalStep ?? 'start')
  const [fromPapers, setFromPapers] = useState<Record<string, string>>(start?.fromPapers ?? {})
  const [papers, setPapers] = useState<Paper[]>([]) // everything saved in My papers
  const [chosen, setChosen] = useState<string[]>(start?.chosen ?? []) // the photos going in the reply

  useEffect(() => {
    listPapers()
      .then((all) => {
        setPapers(all)
        // A photo deleted from My papers since last time can't go in the reply.
        setChosen((old) => old.filter((id) => all.some((p) => p.id === id)))
      })
      .catch(() => setPapers([]))
  }, [])

  // Autosave, after every change.
  useEffect(() => {
    saveProgress({ letter: letterKey(letter), pickedBoxes, answers, renewal, renewalStep, chosen, fromPapers })
  }, [letter, pickedBoxes, answers, renewal, renewalStep, chosen, fromPapers])

  const { letterType } = letter
  // What the county asked for.
  const asked = letterType === 'MC355' ? (pickedBoxes ?? []) : whatToSend(letterType, letter.facts.ask ?? null)
  const renewalForm = needsRenewalForm(letterType, asked)
  // The papers in the reply: for a renewal, the filled-in form, then the proof
  // its answers need. The county's other papers stay on the list.
  const toSend = renewalForm ? [RENEWAL_FORM, ...asked.filter((item) => !coveredByForm(item)), ...renewalPapers(renewal)] : asked
  // The papers to go through one at a time (null: the MC 355 boxes are not picked yet).
  const photoItems = renewalForm ? toSend.filter((item) => item !== RENEWAL_FORM) : letterType === 'MC355' ? pickedBoxes : asked
  // "I don't have one" answers become a signed statement in the reply.
  const statements = (photoItems ?? []).filter((item) => answers[item] === 'none').map((item) => helpFor(item).noneLine!)
  const later = (photoItems ?? []).filter((item) => answers[item] === 'later')
  // What goes in the envelope, for the cover letter's "I am including" list.
  const included = toSend.filter((item) => answers[item] !== 'none' && answers[item] !== 'later')
  // Proof for something the person said they have: "I don't have it" doesn't apply.
  const proofFor = new Set(renewalForm ? renewalPapers(renewal) : [])

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

  // A photo the AI helper asked for, or a proof photo from the renewal
  // questions. A new photo of the same paper replaces the old one in the reply.
  async function addPhoto(item: string, paperId: string, attach = true) {
    const all = await listPapers()
    setPapers(all)
    if (!attach) return
    setChosen((old) => [...old.filter((id) => id !== paperId && all.find((p) => p.id === id)?.name !== item), paperId])
    setAnswers((old) => ({ ...old, [item]: 'photo' }))
  }

  // One renewal answer. A fact read off a paper also answers its yes/no
  // question ("Do you get Social Security?").
  function answerRenewal(id: string, value: string | null, fromPaper?: string) {
    setRenewal((old) => {
      const next = { ...old }
      if (value === null) delete next[id]
      else next[id] = value
      if (value && PARENT[id] && !next[PARENT[id]]) next[PARENT[id]] = 'yes'
      return next
    })
    setFromPapers((old) => {
      const next = { ...old }
      if (fromPaper) next[id] = fromPaper
      else delete next[id]
      return next
    })
  }

  // Facts the AI helper read off the papers (Neil's fill_renewal_answers tool).
  function fillFromPapers(found: { question: string; value: string; paperName: string }[]) {
    for (const f of found) answerRenewal(f.question, f.value, f.paperName)
  }

  const renewalProps: RenewalProps | null = renewalForm
    ? {
        answers: renewal,
        step: renewalStep,
        fromPapers,
        onAnswer: answerRenewal,
        onStep: (step) => {
          setRenewalStep(step)
          window.scrollTo(0, 0)
        },
        onPhoto: (paper, attach) => addPhoto(paper.name, paper.id, attach),
      }
    : null

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
    renewal: renewalProps,
    canSayNone: (item: string) => !proofFor.has(item),
  }

  return {
    toSend,
    included,
    photoItems,
    statements,
    later,
    answers,
    papers,
    setPapers,
    chosen,
    setChosen,
    addPhoto,
    stepsProps,
    renewalForm,
    renewal,
    fromPapers,
    fillFromPapers,
  }
}
