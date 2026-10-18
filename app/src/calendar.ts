// "Remind me on my calendar": a calendar file (.ics) for the deadline, with
// two reminders at 9 in the morning, a week before and the day before. Phone
// calendars know how to open this kind of file.
// It holds only the job and the date, never a case number, because phone
// calendars are often saved online.

export function deadlineEvent(event: { title: string; date: string; details: string; now: Date }): string {
  const day = event.date.replace(/-/g, '')
  const dayAfter = new Date(Date.parse(`${event.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '')
  const stamp = event.now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '') // like 20261018T160000Z
  const reminder = (before: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(event.title)}`, `TRIGGER:${before}`, 'END:VALARM']
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ReplyBy//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    // The same job and day always get the same id, so adding it twice changes
    // the event instead of making a second one (on most calendars).
    `UID:${day}-${event.title.toLowerCase().replace(/[^a-z]+/g, '-')}@replyby`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${dayAfter}`,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(event.details)}`,
    // The event starts at midnight, so 6 days and 15 hours before is 9 am a week earlier,
    ...reminder('-P6DT15H'),
    // and 15 hours before is 9 am the day before.
    ...reminder('-PT15H'),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

// Saves the calendar file. On a phone, opening the file opens the calendar,
// with an Add button.
export function addToCalendar(ics: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// Commas, semicolons and new lines have special meanings in a calendar file.
function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// Calendar files keep lines short. A long line goes on in the next line,
// which starts with a space.
function fold(line: string): string {
  const pieces = []
  for (let i = 0; i < line.length; i += 70) pieces.push(line.slice(i, i + 70))
  return pieces.join('\r\n ')
}
