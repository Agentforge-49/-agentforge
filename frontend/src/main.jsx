import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { shouldReloadPreloadError } from './lib/preload-recovery.js'

window.addEventListener('vite:preloadError', event => {
  event.preventDefault()
  const marker = 'agentforge:last-preload-reload'
  const lastReload = window.sessionStorage.getItem(marker)
  if (shouldReloadPreloadError(lastReload)) {
    window.sessionStorage.setItem(marker, String(Date.now()))
    window.location.reload()
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
