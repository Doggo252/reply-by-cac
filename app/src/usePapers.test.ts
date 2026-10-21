import { describe, expect, it } from 'vitest'
import { allowedPicks, needsRenewalForm, onePerPaper } from './usePapers'
import type { Paper } from './storage'

const paper = (id: string, name: string, addedAt: string) => ({ id, name, addedAt }) as Paper

describe('the photos going in the reply', () => {
  const all = [
    paper('old', 'Your Social Security letter', '2026-10-20T10:00:00Z'),
    paper('new', 'Your Social Security letter', '2026-10-20T10:05:00Z'),
    paper('bank', 'Your newest bank statement', '2026-10-20T10:06:00Z'),
    paper('card', 'Your Medicare card', '2026-10-20T10:07:00Z'),
  ]

  // From the Oct 20 run: a retaken photo was in twice, and the AI added the card.
  it('keeps the newest photo of each paper, and never the Medicare card', () => {
    expect(onePerPaper(['old', 'new', 'bank', 'card'], all)).toEqual(['new', 'bank'])
  })

  // From the Oct 20 run: the AI added a photo saved for the letter before.
  it("lets the AI add papers on this letter's list, or taken for this letter", () => {
    const papers = [
      paper('ssa', 'Your Social Security letter', '2026-10-20T09:00:00Z'),
      paper('other', 'Proof of income, like a pay stub', '2026-10-20T09:30:00Z'),
      paper('receipt', 'Mail receipt', '2026-10-20T11:00:00Z'),
    ]
    const list = ['Your Social Security letter', 'Your newest bank statement']
    expect(allowedPicks(['ssa', 'other', 'receipt'], papers, list, '2026-10-20T10:00:00Z')).toEqual(['ssa', 'receipt'])
  })
})

describe('which letters need the renewal form', () => {
  it('a renewal, or a stop letter that asks for the renewal form', () => {
    expect(needsRenewalForm('MC210_RV', [])).toBe(true)
    expect(needsRenewalForm('MC_239A', ['Your renewal form (MC 210 RV), filled in and signed'])).toBe(true)
    expect(needsRenewalForm('MC_239A', ['Proof of income'])).toBe(false)
    expect(needsRenewalForm('MC355', ['Your renewal form'])).toBe(false)
  })
})
