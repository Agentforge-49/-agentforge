import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
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

const root = document.getElementById('root')
const application = (
  <StrictMode>
    <App />
  </StrictMode>
)

if (root.hasChildNodes() && window.location.pathname === '/') hydrateRoot(root, application)
else {
  root.replaceChildren()
  createRoot(root).render(application)
}
