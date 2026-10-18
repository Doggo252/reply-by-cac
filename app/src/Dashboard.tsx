// "How well ReplyBy works": the saved test results, for judges and anyone
// curious. The numbers come from core/eval/make_dashboard.py, which reads
// the saved results only (no AI calls). Works offline.
import data from './fixtures/dashboard.json'
import { plain } from './words'

const pct = ([right, total]: number[]) => `${((100 * right) / total).toFixed(1)}%`
const DATE_NAMES: Record<string, string> = {
  notice_date: 'Letter date',
  due_date: 'Reply-by date',
  effective_date: 'Stop date',
}

// One thin bar: how much of the whole was right. The number beside it is the
// label, so the bar never has to be read on its own.
function Bar({ part, label }: { part: number[]; label: string }) {
  return (
    <div className="meter" title={`${label}: ${part[0]} of ${part[1]} (${pct(part)})`}>
      <div className="meter-fill" style={{ width: `${(100 * part[0]) / part[1]}%` }} />
    </div>
  )
}

export default function Dashboard({ onBack }: { onBack: () => void }) {
  const { reader_a: a, reader_b: b, together, matched_on_phone: phone, neils_tests: tests } = data
  const bByType = Object.fromEntries(b.by_type.map(([type, right, total]) => [type, [right, total] as number[]]))

  return (
    <>
      <h1 className="page-title">How well ReplyBy works</h1>
      <p className="lead">
        Tested on {data.letters_tested} fake letters the app had never seen, photographed tilted, blurry, folded,
        cut off and with a thumb in the way.
      </p>

      <div className="tiles">
        <div className="tile">
          <p className="tile-number">{pct(b.type_right)}</p>
          <p className="tile-label">Reader B (on the phone) named the letter right</p>
        </div>
        <div className="tile">
          <p className="tile-number">{pct(a.type_right)}</p>
          <p className="tile-label">Reader A (the AI) named the letter right</p>
        </div>
        <div className="tile">
          <p className="tile-number">{pct(together.disagree)}</p>
          <p className="tile-label">The two readers disagreed, so the app asked the person</p>
        </div>
        <div className="tile">
          <p className="tile-number">{together.agree_but_wrong}</p>
          <p className="tile-label">Times both agreed and were both wrong, out of {data.letters_tested}</p>
        </div>
      </div>

      <div className="card">
        <h2>Letter named right, by letter</h2>
        <table className="results">
          <thead>
            <tr>
              <th>Letter</th>
              <th>Reader A</th>
              <th>Reader B</th>
            </tr>
          </thead>
          <tbody>
            {a.by_type.map(([type, part]) => {
              const typeName = type as string
              const aPart = part as number[]
              const bPart = bByType[typeName]
              const name = typeName === 'OTHER' ? 'Any other letter' : plain(typeName)
              return (
                <tr key={typeName}>
                  <td>{name}</td>
                  <td>
                    {pct(aPart)}
                    <Bar part={aPart} label={`Reader A, ${name}`} />
                  </td>
                  <td>
                    {pct(bPart)}
                    <Bar part={bPart} label={`Reader B, ${name}`} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Dates found by the AI</h2>
        <p className="small">
          The AI often leaves a date blank, but it never made one up. Every blank date is flagged on the "Is this
          right?" screen, so the person types it in.
        </p>
        <table className="results">
          <thead>
            <tr>
              <th>Date</th>
              <th>Right</th>
              <th>Wrong</th>
              <th>Left blank</th>
              <th>Made up</th>
            </tr>
          </thead>
          <tbody>
            {a.dates.map(([field, right, wrong, missed, madeUp]) => (
              <tr key={field as string}>
                <td>{DATE_NAMES[field as string] ?? (field as string)}</td>
                <td>{pct(right as number[])}</td>
                <td>{wrong as number}</td>
                <td>{missed as number}</td>
                <td>{madeUp as number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Safety checks</h2>
        <ul className="checklist">
          <li>Case numbers the AI ever saw: {a.case_numbers_seen}. They are blanked on the phone first.</li>
          <li>Dates the AI made up in its answers: 0. Any made-up date is rejected by code.</li>
          <li>
            The phone gives the same answers as Neil's Python on {phone.checker_dates.toLocaleString()} dates and{' '}
            {phone.checker_forms} forms (the checker) and {phone.county_mistake_cases} timelines (county mistakes).
          </li>
          <li>
            Neil's own tests: {tests.deadline_rules} for the deadline rules, {tests.checker} for the checker,{' '}
            {tests.county_mistakes} for the county-mistake rules.
          </li>
          <li>The AI helper cannot make the final packet unless the check passed and the person signed.</li>
        </ul>
      </div>

      <button className="button" onClick={onBack}>
        Back
      </button>
    </>
  )
}
