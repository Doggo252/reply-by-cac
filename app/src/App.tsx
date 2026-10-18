// The app frame: two big tabs at the bottom (Neil's choice, Oct 18).
//   My letter    read a letter, see the one thing to do, and do it
//   My papers    the receipt vault
// "What happened" (the timeline) opens from the letter screen.
// The checked letter is saved on the phone, so closing the app loses nothing.
import { useState } from 'react'
import Capture from './Capture'
import LetterHome from './LetterHome'
import Timeline from './Timeline'
import Vault from './Vault'
import ReplyPacket from './ReplyPacket'
import AgentHelper from './AgentHelper'
import Dashboard from './Dashboard'
import ReadAloud from './ReadAloud'
import { loadLetter, saveDrafts, saveLetter, type SavedLetter } from './storage'

type Tab = 'letter' | 'papers'
// What the My letter tab is showing.
type View = 'home' | 'manual' | 'helper' | 'happened'

export default function App() {
  const [tab, setTab] = useState<Tab>('letter')
  const [letter, setLetter] = useState<SavedLetter | null>(loadLetter)
  const [view, setView] = useState<View>('home')
  // The manual steps start with the hearing ticked only when the person asked for one.
  const [withHearing, setWithHearing] = useState(false)
  // On the My papers tab: the papers, or the test results.
  const [results, setResults] = useState(false)

  function show(next: View) {
    setView(next)
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
    setView('home')
    keepLetter(null)
  }

  function open(next: Tab) {
    setTab(next)
    setResults(false)
    if (next === 'letter') setView('home')
    window.scrollTo(0, 0)
  }

  function letterTab() {
    if (!letter) return <Capture onDone={keepLetter} />
    if (view === 'manual') return <ReplyPacket letter={letter} withHearing={withHearing} onBack={() => show('home')} />
    if (view === 'helper') {
      return <AgentHelper letter={letter} onBack={() => show('home')} onManual={() => { setWithHearing(false); show('manual') }} />
    }
    if (view === 'happened') return <Timeline letter={letter} onBack={() => show('home')} />
    return (
      <LetterHome
        letter={letter}
        onNewLetter={newLetter}
        onAddEvent={() => show('happened')}
        onMakeReply={(hearing) => {
          setWithHearing(hearing)
          show('manual')
        }}
        onUseHelper={() => show('helper')}
      />
    )
  }

  return (
    <>
      <main className="screen">
        <div className="top-bar">
          <p className="app-name">ReplyBy</p>
          <ReadAloud />
        </div>
        {tab === 'letter' && letterTab()}
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
