import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Atkinson Hyperlegible: a free font from the Braille Institute, made for
// people with low vision (I, l and 1 all look different). Bundled with the
// app, so it works offline too.
import '@fontsource/atkinson-hyperlegible/latin-400.css'
import '@fontsource/atkinson-hyperlegible/latin-700.css'
import './index.css'
import { registerServiceWorker } from './registerServiceWorker'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

registerServiceWorker()
