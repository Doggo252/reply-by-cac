import { describe, expect, it } from 'vitest'
import { deadlineEvent } from './calendar'

const event = {
  title: 'Last day to send your Medi-Cal papers',
  date: '2026-10-27',
  details: 'The county needs:\n- Bank statements, last 3 months\n- Proof of income; any kind',
  now: new Date('2026-10-18T16:00:00Z'),
}

describe('deadlineEvent', () => {
  const ics = deadlineEvent(event)
  const unfolded = ics.replace(/\r\n /g, '')

  it('is an all-day event on the deadline', () => {
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20261027')
    expect(unfolded).toContain('DTEND;VALUE=DATE:20261028')
    expect(unfolded).toContain('DTSTAMP:20261018T160000Z')
  })

  it('reminds a week before and the day before, at 9 am', () => {
    expect(unfolded).toContain('TRIGGER:-P6DT15H')
    expect(unfolded).toContain('TRIGGER:-PT15H')
  })

  it('escapes commas, semicolons and new lines', () => {
    expect(unfolded).toContain('DESCRIPTION:The county needs:\\n- Bank statements\\, last 3 months\\n- Proof of income\\; any kind')
  })

  it('ends lines with CRLF and keeps them short', () => {
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    for (const line of ics.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75)
  })

  it('crosses the end of a month', () => {
    expect(deadlineEvent({ ...event, date: '2026-10-31' })).toContain('DTEND;VALUE=DATE:20261101')
  })
})
