// The very first screen: pick a language. Both choices are written in their
// own language, so anyone can read the one they need.
import type { Language } from './language'

export default function LanguageChoice({ onChoose }: { onChoose: (language: Language) => void }) {
  return (
    <>
      <h1 className="page-title">
        Choose your language
        <br />
        <span lang="es">Elija su idioma</span>
      </h1>
      <button className="button primary big" onClick={() => onChoose('en')}>
        English
      </button>
      <button className="button primary big" lang="es" onClick={() => onChoose('es')}>
        Español
      </button>
      <p className="hint">
        You can change this later in My papers.
        <br />
        <span lang="es">Puede cambiarlo después en Mis papeles.</span>
      </p>
    </>
  )
}
