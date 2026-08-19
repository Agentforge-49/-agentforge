import { useState } from 'react'

import { appLogoUrl } from '../lib/app-logo-sources.js'

const BRAND_STYLES = {
  airtable:['#f82b60', 'A'], anthropic:['#191919', 'AI'], discord:['#5865f2', 'D'],
  github:['#181717', 'GH'], google_drive:['#0f9d58', 'Drive'], google_sheets:['#188038', 'Sheets'],
  hubspot:['#ff5c35', 'H'], jira:['#0052cc', 'J'], linear:['#5e6ad2', 'L'],
  microsoft_teams:['#6264a7', 'T'], notion:['#111111', 'N'], openai:['#111827', 'OA'],
  resend:['#111111', 'R'], salesforce:['#00a1e0', 'SF'], shopify:['#7ab55c', 'S'],
  slack:['#4a154b', ''], stripe:['#635bff', 'S'], supabase:['#1c8f5d', 'S'],
  twilio:['#f22f46', 'T'], zendesk:['#03363d', 'Z'], gmail:['#ea4335', 'M'],
}

function fallbackLabel(name) {
  return String(name || 'App').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

export default function AppLogo({ slug, name, size = 42, className = '' }) {
  const [imageFailed, setImageFailed] = useState(false)
  const [color, label] = BRAND_STYLES[slug] || ['#246b4b', fallbackLabel(name)]
  if (slug === 'slack') {
    return (
      <span className={`app-logo app-logo--slack ${className}`} style={{ width:size, height:size }} role="img" aria-label={`${name} logo`}>
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path d="M17.1 7.2a3.6 3.6 0 0 1 7.2 0v9.1h-3.6a3.6 3.6 0 0 1-3.6-3.6V7.2Z" fill="#36C5F0"/>
          <path d="M32.8 17.1a3.6 3.6 0 1 1 0 7.2h-9.1v-3.6a3.6 3.6 0 0 1 3.6-3.6h5.5Z" fill="#2EB67D"/>
          <path d="M22.9 32.8a3.6 3.6 0 1 1-7.2 0v-9.1h3.6a3.6 3.6 0 0 1 3.6 3.6v5.5Z" fill="#ECB22E"/>
          <path d="M7.2 22.9a3.6 3.6 0 1 1 0-7.2h9.1v3.6a3.6 3.6 0 0 1-3.6 3.6H7.2Z" fill="#E01E5A"/>
        </svg>
      </span>
    )
  }
  return (
    <span className={`app-logo ${className}`} style={{ width:size, height:size, '--app-color':color }} role="img" aria-label={`${name} logo`}>
      {!imageFailed && <img src={appLogoUrl(slug)} alt="" loading="lazy" onError={() => setImageFailed(true)} />}
      {imageFailed && <span>{label}</span>}
    </span>
  )
}
