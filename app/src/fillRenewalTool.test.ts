// Tests for the code behind Neil's fill_renewal_answers tool (agent/TOOLS.md):
// only facts printed on a paper, only into blanks, only for renewals.
import { describe, expect, it } from 'vitest'
import { TOOLS, newRunState, type AgentWorld } from './agentTools'

const SSA = 'Social Security Administration\nYour monthly benefit before deductions is $1,240.00\nMedicare premium $185.00'
const CARD = 'MEDICARE\nMedicare Number 1EG4-TE5-MK73'

function world(answers: Record<string, string>, letterType = 'MC210_RV') {
  const filled: { question: string; value: string; paperName: string }[] = []
  const fake = {
    letter: { id: 'letter-1', letterType, facts: {}, text: '' },
    consent: true,
    privateNames: [],
    listPapers: async () => [
      { id: 'ssa', name: 'Your Social Security letter', addedAt: '2026-10-19T10:00:00Z' },
      { id: 'card', name: 'Your Medicare card', addedAt: '2026-10-19T10:00:00Z' },
    ],
    paperText: async (id: string) => (id === 'ssa' ? SSA : id === 'card' ? CARD : null),
    listEvents: async () => [],
    takePhoto: async () => null,
    review: async () => null,
    sign: async () => null,
    build: async () => '',
    renewal:
      letterType === 'MC210_RV'
        ? {
            answers: () => answers,
            fill: (found: { question: string; value: string; paperName: string }[]) => filled.push(...found),
          }
        : undefined,
  } as AgentWorld
  return { fake, filled }
}

const fill = (w: AgentWorld, answers: unknown[]) =>
  TOOLS.fill_renewal_answers.run({ letter_id: 'letter-1', answers }, w, newRunState())

describe('fill_renewal_answers', () => {
  it('fills blanks with facts printed on the paper, and says which paper', async () => {
    const { fake, filled } = world({ social_security: 'yes', social_security_amount: '', medicare: 'yes' })
    const result = await fill(fake, [
      { question: 'social_security_amount', value: '1,240.00', paper_id: 'ssa' },
      { question: 'medicare_number', value: '1EG4-TE5-MK73', paper_id: 'card' },
    ])
    expect(result).toMatchObject({ ok: true, accepted: ['social_security_amount', 'medicare_number'], refused: [] })
    expect(filled[0]).toMatchObject({ question: 'social_security_amount', value: '1,240.00', paperName: 'Your Social Security letter' })
    // Part B is still blank: the AI did not send it.
    expect(result.still_blank).toEqual(['medicare_part_b_premium'])
  })

  it('refuses a value that is not on the paper', async () => {
    const { fake, filled } = world({ social_security: 'yes' })
    const result = await fill(fake, [{ question: 'social_security_amount', value: '1,500.00', paper_id: 'ssa' }])
    expect(result.refused).toEqual([{ question: 'social_security_amount', reason: 'that value is not printed on that paper' }])
    expect(filled).toEqual([])
  })

  it('never answers a question about the person\'s life', async () => {
    const { fake } = world({})
    const result = await fill(fake, [{ question: 'household_change', value: 'no', paper_id: 'ssa' }])
    expect(result.refused).toEqual([{ question: 'household_change', reason: 'not a fact printed on a paper' }])
  })

  it('never changes what the person typed', async () => {
    const { fake } = world({ social_security: 'yes', social_security_amount: '1,200.00' })
    const result = await fill(fake, [{ question: 'social_security_amount', value: '1,240.00', paper_id: 'ssa' }])
    expect(result.refused).toEqual([{ question: 'social_security_amount', reason: 'the person already answered this' }])
  })

  it('refuses a paper that does not exist', async () => {
    const { fake } = world({})
    const result = await fill(fake, [{ question: 'bank_balance', value: '10.00', paper_id: 'nope' }])
    expect(result.refused).toEqual([{ question: 'bank_balance', reason: 'no such paper' }])
  })

  it('is only for renewal forms', async () => {
    const { fake } = world({}, 'MC355')
    expect(await fill(fake, [])).toEqual({ ok: false, reason: 'only for renewal forms' })
  })
})
