// The plain-language explanation, from Neil's prompt (prompts/explain.md),
// with a switch between English and Spanish.
import { useEffect, useState } from 'react'
import { askForExplanation, type Explanation as Result } from './readerA'

type Language = 'english' | 'spanish'

const URGENCY_WORDS: Record<string, Record<Language, string>> = {
  high: { english: 'Act now', spanish: 'Actúe ahora' },
  med: { english: 'Act soon', spanish: 'Actúe pronto' },
  low: { english: 'You have some time', spanish: 'Tiene algo de tiempo' },
  'already passed': { english: 'This date has passed', spanish: 'Esta fecha ya pasó' },
  'no due date': { english: 'No due date found', spanish: 'No se encontró fecha límite' },
}

export default function Explanation({ facts }: { facts: Record<string, unknown> }) {
  const [language, setLanguage] = useState<Language>('english')
  const [result, setResult] = useState<Result | null>(null)
  const [state, setState] = useState<'loading' | 'done' | 'failed'>('loading')

  useEffect(() => {
    let current = true
    setState('loading')
    askForExplanation(facts, language).then((answer) => {
      if (!current) return
      setResult(answer)
      setState(answer ? 'done' : 'failed')
    })
    // If the language changes before the answer comes back, ignore the old one.
    return () => {
      current = false
    }
  }, [facts, language])

  return (
    // lang tells the "Read it to me" button which voice to use.
    <div className="card" lang={language === 'spanish' ? 'es' : 'en'}>
      <div className="explanation-top">
        <h2>{language === 'english' ? 'What this letter means' : 'Qué significa esta carta'}</h2>
        <div className="language-switch">
          <button className={language === 'english' ? 'on' : ''} onClick={() => setLanguage('english')}>
            English
          </button>
          <button className={language === 'spanish' ? 'on' : ''} onClick={() => setLanguage('spanish')}>
            Español
          </button>
        </div>
      </div>
      {state === 'loading' && <p className="hint" role="status">{language === 'english' ? 'Writing…' : 'Escribiendo…'}</p>}
      {state === 'failed' && (
        <p className="hint">
          We couldn't explain it right now. The date and steps above are still right.
        </p>
      )}
      {state === 'done' && result && (
        <>
          <p className={`urgency ${result.urgency.replace(' ', '-')}`}>
            {URGENCY_WORDS[result.urgency]?.[language] ?? result.urgency}
          </p>
          <p className="explanation-text">{result.explanation}</p>
        </>
      )}
    </div>
  )
}
