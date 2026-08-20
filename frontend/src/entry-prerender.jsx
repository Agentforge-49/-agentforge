import { renderToString } from 'react-dom/server'
import { Router } from 'wouter'

import Landing from './pages/Landing.jsx'

const staticLocationHook = () => ['/', () => {}]

export function renderLanding() {
  return renderToString(
    <Router hook={staticLocationHook}>
      <Landing />
    </Router>,
  )
}
