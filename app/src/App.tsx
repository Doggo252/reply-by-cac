// The app frame: two big tabs at the bottom (Neil's choice, Oct 18).
//   My letter    read a letter, see the one thing to do, and do it
//   My papers    the receipt vault
// "What happened" (the timeline) opens from the letter screen.
// The checked letter is saved on the phone, so closing the app loses nothing.
import { useEffect, useState } from 'react'
import Capture from './Capture'
import LetterHome from './LetterHome'
import Timeline from './Timeline'
import Vault from './Vault'
import ReplyPacket from './ReplyPacket'
import AgentHelper from './AgentHelper'
import Dashboard from './Dashboard'
import ReadAloud from './ReadAloud'
import LanguageChoice from './LanguageChoice'
import { getLanguage, hasChosenLanguage, setLanguage, t, type Language } from './language'
import { loadLetter, loadView, saveDrafts, saveLetter, saveProgress, saveView, type SavedLetter } from './storage'

type Tab = 'letter' | 'papers'
// What the My letter tab is showing.
type View = 'home' | 'manual' | 'helper' | 'happened'
const VIEWS: View[] = ['home', 'manual', 'helper', 'happened']

export default function App() {
  // The language, picked on the very first screen (null: not picked yet).
  const [language, setChosen] = useState<Language | null>(() => (hasChosenLanguage() ? getLanguage() : null))
  const [tab, setTab] = useState<Tab>('letter')
  const [letter, setLetter] = useState<SavedLetter | null>(loadLetter)
  // The app reopens on the screen it was on, with the answers saved (usePapers.ts).
  const [view, setView] = useState<View>(() => {
    const saved = loadView() as View | null
    return saved && VIEWS.includes(saved) && loadLetter() ? saved : 'home'
  })
  // The manual steps start with the hearing ticked only when the person asked for one.
  const [withHearing, setWithHearing] = useState(false)
  // On the My papers tab: the papers, or the test results.
  const [results, setResults] = useState(false)

  useEffect(() => saveView(view), [view])
  // Tell the browser (and the phone's voice) which language the page is in.
  useEffect(() => {
    document.documentElement.lang = language ?? 'en'
  }, [language])

  // The phone's back button goes back to the letter screen, instead of
  // closing the app. Nothing is lost either way: answers are saved as they go.
  useEffect(() => {
    if (view === 'home') return
    window.history.pushState({ view }, '')
    const back = () => {
      setView('home')
      window.scrollTo(0, 0)
    }
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [view])

  function show(next: View) {
    setView(next)
    window.scrollTo(0, 0)
  }

  function keepLetter(checked: SavedLetter | null) {
    saveLetter(checked)
    setLetter(checked)
    window.scrollTo(0, 0)
  }

  function choose(next: Language) {
    setLanguage(next)
    setChosen(next)
    window.scrollTo(0, 0)
  }

  function newLetter() {
    if (!window.confirm(t('Read a different letter? The deadlines for this one will be cleared.'))) return
    saveDrafts(null)
    saveProgress(null)
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

  // The very first screen: the language.
  if (!language) {
    return (
      <main className="screen">
        <div className="top-bar">
          <p className="app-name">ReplyBy</p>
        </div>
        <LanguageChoice onChoose={choose} />
      </main>
    )
  }

  return (
    // key: a new language redraws every screen in that language.
    <div key={language}>
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
            <Vault
              onShowResults={() => { setResults(true); window.scrollTo(0, 0) }}
              onChangeLanguage={() => setChosen(null)}
            />
          ))}
      </main>

      <nav className="tabbar" aria-label={t('Main')}>
        <div className="tabbar-inner">
          <TabButton label={t('My letter')} on={tab === 'letter'} onClick={() => open('letter')}>
            <path d="M3 6h18v12H3z" strokeLinejoin="round" />
            <path d="M3 6l9 7 9-7" strokeLinejoin="round" />
          </TabButton>
          <TabButton label={t('My papers')} on={tab === 'papers'} onClick={() => open('papers')}>
            <path d="M3 7h7l2 2h9v10H3z" strokeLinejoin="round" />
          </TabButton>
        </div>
      </nav>
    </div>
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
