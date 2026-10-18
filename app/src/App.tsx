// The app frame: three big tabs at the bottom.
//   My letter      read a letter, then see what it means and the deadlines
//   My timeline    what happened, checked for county mistakes
//   My papers      the receipt vault
// The checked letter is saved on the phone, so closing the app loses nothing.
import { useState } from 'react'
import Capture from './Capture'
import LetterHome from './LetterHome'
import Timeline from './Timeline'
import Vault from './Vault'
import ReplyPacket from './ReplyPacket'
import AgentHelper from './AgentHelper'
import Dashboard from './Dashboard'
import { loadLetter, saveDrafts, saveLetter, type SavedLetter } from './storage'

type Tab = 'letter' | 'happened' | 'papers'

export default function App() {
  const [tab, setTab] = useState<Tab>('letter')
  const [letter, setLetter] = useState<SavedLetter | null>(loadLetter)
  // On the My letter tab: the letter itself, the manual reply steps, or the AI helper.
  const [reply, setReply] = useState<'none' | 'manual' | 'helper'>('none')
  // On the My papers tab: the papers, or the test results.
  const [results, setResults] = useState(false)

  function showReply(next: 'none' | 'manual' | 'helper') {
    setReply(next)
    window.scrollTo(0, 0)
  }

  function keepLetter(checked: SavedLetter | null) {
    saveLetter(checked)
    setLetter(checked)
    window.scrollTo(0, 0)
  }

  function newLetter() {
    if (!window.confirm('Read a different letter? The deadlines for this one will be cleared.')) return
    saveDrafts(null)
    setReply('none')
    keepLetter(null)
  }

  function open(next: Tab) {
    setTab(next)
    setResults(false)
    window.scrollTo(0, 0)
  }

  return (
    <>
      <main className="screen">
        <p className="app-name">ReplyBy</p>
        {tab === 'letter' &&
          (letter && reply === 'manual' ? (
            <ReplyPacket letter={letter} onBack={() => showReply('none')} />
          ) : letter && reply === 'helper' ? (
            <AgentHelper letter={letter} onBack={() => showReply('none')} onManual={() => showReply('manual')} />
          ) : letter ? (
            <LetterHome
              letter={letter}
              onNewLetter={newLetter}
              onAddEvent={() => open('happened')}
              onMakeReply={() => showReply('manual')}
              onUseHelper={() => showReply('helper')}
            />
          ) : (
            <Capture onDone={keepLetter} />
          ))}
        {tab === 'happened' && <Timeline letter={letter} />}
        {tab === 'papers' &&
          (results ? (
            <Dashboard onBack={() => { setResults(false); window.scrollTo(0, 0) }} />
          ) : (
            <Vault onShowResults={() => { setResults(true); window.scrollTo(0, 0) }} />
          ))}
      </main>

      <nav className="tabbar" aria-label="Main">
        <div className="tabbar-inner">
          <TabButton label="My letter" on={tab === 'letter'} onClick={() => open('letter')}>
            <path d="M3 6h18v12H3z" strokeLinejoin="round" />
            <path d="M3 6l9 7 9-7" strokeLinejoin="round" />
          </TabButton>
          <TabButton label="My timeline" on={tab === 'happened'} onClick={() => open('happened')}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </TabButton>
          <TabButton label="My papers" on={tab === 'papers'} onClick={() => open('papers')}>
            <path d="M3 7h7l2 2h9v10H3z" strokeLinejoin="round" />
          </TabButton>
        </div>
      </nav>
    </>
  )
}

function TabButton({ label, on, onClick, children }: {
  label: string
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button className={`tab ${on ? 'on' : ''}`} onClick={onClick} aria-current={on ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {children}
      </svg>
      {label}
    </button>
  )
}
