import { describe, expect, it } from 'vitest'
import { linesToRead } from './speech'

describe('linesToRead', () => {
  it('reads one line at a time, without empty lines', () => {
    expect(linesToRead('Step 1 of 4\n\nWhich boxes are checked?\n').map((l) => l.text)).toEqual([
      'Step 1 of 4',
      'Which boxes are checked?',
    ])
  })

  it('drops marks a voice would read out', () => {
    expect(linesToRead('✓ Photo added\n✉ You\'ll put the paper copy in the envelope').map((l) => l.text)).toEqual([
      'Photo added',
      "You'll put the paper copy in the envelope",
    ])
  })

  it('reads capital-letter labels as normal words, but keeps form names', () => {
    expect(linesToRead('PAGE 1: THE COVER LETTER\nMC 355').map((l) => l.text)).toEqual(['Page 1: the cover letter', 'MC 355'])
  })

  it('does not read the same line twice in a row', () => {
    expect(linesToRead('Back\nBack')).toHaveLength(1)
  })

  it('uses a Spanish voice for the Spanish explanation', () => {
    const lines = linesToRead('Explain this letter to me\nSu Medi-Cal se detuvo.', ['Qué significa esta carta\nSu Medi-Cal se detuvo.'])
    expect(lines.map((l) => l.lang)).toEqual(['en-US', 'es-US'])
  })
})
