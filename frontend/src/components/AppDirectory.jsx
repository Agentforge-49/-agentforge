import { useMemo, useState } from 'react'
import {
  ArrowRight, CheckCircle2, KeyRound, Search, ShieldCheck,
  Sparkles, Unplug,
} from 'lucide-react'

import {
  INTEGRATION_CATALOG,
  INTEGRATION_CATEGORIES,
  INTEGRATION_COUNTS,
} from '../lib/integration-catalog.js'
import { appConnectionPath, isAppConnected } from '../lib/app-connections.js'
import { useNavigate } from '../lib/router.jsx'
import AppLogo from './AppLogo.jsx'
import './AppDirectory.css'

const PAGE_SIZE = 30

export default function AppDirectory({ workspace = false, connectedProviders = new Set() }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [mode, setMode] = useState('all')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return INTEGRATION_CATALOG.filter(app => {
      if (category !== 'All' && app.category !== category) return false
      if (mode !== 'all' && app.mode !== mode) return false
      return !needle || `${app.name} ${app.slug} ${app.category}`.toLowerCase().includes(needle)
    })
  }, [query, category, mode])

  const connect = app => {
    if (!workspace) {
      navigate('/signup')
      return
    }
    navigate(appConnectionPath(app))
  }

  const modeLabel = app => {
    if (app.mode === 'native') return 'Native action'
    return 'Universal API'
  }

  return (
    <section className={`app-directory${workspace ? ' app-directory--workspace' : ''}`}>
      <div className="app-directory-summary">
        <div><strong>{INTEGRATION_COUNTS.catalog}</strong><span>curated working apps</span></div>
        <div><strong>{INTEGRATION_COUNTS.native}</strong><span>native connectors now</span></div>
        <div><strong>{INTEGRATION_COUNTS.universal}</strong><span>universal API connectors</span></div>
        <div className="is-ready"><strong>100%</strong><span>real setup paths</span></div>
      </div>

      <div className="app-directory-toolbar">
        <div className="app-directory-search">
          <Search size={17} />
          <input value={query} onChange={event => { setQuery(event.target.value); setVisible(PAGE_SIZE) }}
            placeholder="Search Salesforce, HubSpot, Gmail, Notion..." aria-label="Search integration catalog" />
          <span>{filtered.length.toLocaleString()} matches</span>
        </div>
        <div className="app-directory-modes" aria-label="Connection types">
          {[
            ['all','All apps'],['native','Native actions'],['universal','Universal API'],
          ].map(([value, label]) => (
            <button type="button" className={mode === value ? 'active' : ''} key={value} onClick={() => { setMode(value); setVisible(PAGE_SIZE) }}>{label}</button>
          ))}
        </div>
      </div>

      <div className="app-directory-categories">
        {INTEGRATION_CATEGORIES.map(item => (
          <button type="button" className={category === item ? 'active' : ''} key={item} onClick={() => { setCategory(item); setVisible(PAGE_SIZE) }}>{item}</button>
        ))}
      </div>

      <div className="app-directory-grid">
        {filtered.slice(0, visible).map(app => {
          const connected = isAppConnected(app, connectedProviders)
          return (
          <article className={`app-directory-card${connected ? ' is-connected' : ''}`} key={app.slug}>
            <div className="app-directory-card-top">
              <AppLogo slug={app.slug} name={app.name} />
              <span className={`app-directory-status app-directory-status--${connected ? 'connected' : app.mode}`}>
                {connected ? <CheckCircle2 size={11} /> : app.mode === 'native' ? <CheckCircle2 size={11} /> : <KeyRound size={11} />}
                {connected ? 'Connected' : modeLabel(app)}
              </span>
            </div>
            <small>{app.category}</small>
            <h3>{app.name}</h3>
            <p>{app.mode === 'native'
              ? 'Use a typed AgentForge action with encrypted credentials and observable execution.'
              : 'Use this app through AgentForge’s authenticated HTTP action or start workflows from its signed webhooks.'}</p>
            <div className="app-directory-card-actions">
              <button type="button" onClick={() => connect(app)}>
                {!workspace ? 'See connection options' : connected ? 'Manage connection' : app.mode === 'native' ? 'Set up connector' : 'Connect with API'} <ArrowRight size={13} />
              </button>
            </div>
          </article>
        )})}
      </div>

      {!filtered.length && <div className="app-directory-empty"><Unplug size={24} /><h3>No exact match</h3><p>Use the universal HTTP action or a signed webhook to connect an app that is not cataloged yet.</p></div>}
      {visible < filtered.length && <button className="app-directory-more" type="button" onClick={() => setVisible(value => value + PAGE_SIZE)}>Show 30 more apps <Sparkles size={14} /></button>}

      <div className="app-directory-contract">
        <ShieldCheck size={18} />
        <div><strong>Every listed app has a real execution path.</strong><span>Native apps have typed AgentForge actions. Universal apps use authenticated HTTP requests and signed webhook triggers with the same encrypted vault, approvals, and run history.</span></div>
      </div>
    </section>
  )
}
