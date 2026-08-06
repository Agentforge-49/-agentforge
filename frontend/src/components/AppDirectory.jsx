import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, CheckCircle2, ExternalLink, KeyRound, Search, ShieldCheck,
  Sparkles, Unplug, Webhook,
} from 'lucide-react'

import { createIntegrationConnectLink, getIntegrationBridgeStatus } from '../lib/api'
import {
  INTEGRATION_CATALOG,
  INTEGRATION_CATEGORIES,
  INTEGRATION_COUNTS,
} from '../lib/integration-catalog.js'
import { useNavigate } from '../lib/router.jsx'
import './AppDirectory.css'

const PAGE_SIZE = 30

function appMonogram(name) {
  return name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

export default function AppDirectory({ workspace = false }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [mode, setMode] = useState('all')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [bridge, setBridge] = useState({ configured:false, loading:workspace })
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!workspace) return
    getIntegrationBridgeStatus()
      .then(status => setBridge({ ...status, loading:false }))
      .catch(() => setBridge({ configured:false, loading:false }))
  }, [workspace])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return INTEGRATION_CATALOG.filter(app => {
      if (category !== 'All' && app.category !== category) return false
      if (mode !== 'all' && app.mode !== mode) return false
      return !needle || `${app.name} ${app.slug} ${app.category}`.toLowerCase().includes(needle)
    })
  }, [query, category, mode])

  const connect = async app => {
    if (!workspace) {
      navigate('/signup')
      return
    }
    if (app.mode !== 'bridge') {
      navigate(`/credentials?app=${encodeURIComponent(app.slug)}&mode=${app.mode}`)
      return
    }
    if (!bridge.configured) {
      setNotice('Managed OAuth for the external catalog needs a Pipedream development project. Universal API keys and signed webhooks work now.')
      return
    }
    setBusy(app.slug)
    setNotice('')
    try {
      const result = await createIntegrationConnectLink(app.slug)
      window.location.assign(result.connect_url)
    } catch (error) {
      setNotice(error.message)
      setBusy('')
    }
  }

  const modeLabel = app => {
    if (app.mode === 'native') return 'Native action'
    if (app.mode === 'oauth') return 'OAuth ready'
    return bridge.configured ? 'Managed connection' : 'External bridge'
  }

  return (
    <section className={`app-directory${workspace ? ' app-directory--workspace' : ''}`}>
      <div className="app-directory-summary">
        <div><strong>{INTEGRATION_COUNTS.catalog.toLocaleString()}+</strong><span>discoverable apps</span></div>
        <div><strong>10,000+</strong><span>external actions and triggers</span></div>
        <div><strong>3</strong><span>connection paths</span></div>
        <div className={bridge.configured ? 'is-ready' : ''}>
          <strong>{workspace && bridge.configured ? 'Ready' : 'Honest'}</strong>
          <span>{workspace && bridge.configured ? 'managed bridge configured' : 'readiness labels'}</span>
        </div>
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
            ['all','All apps'],['native','Native'],['oauth','OAuth ready'],['bridge','External bridge'],
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

      {notice && <div className="app-directory-notice"><ShieldCheck size={16} /><span>{notice}</span><button type="button" onClick={() => navigate('/credentials?app=custom_api')}>Use universal API</button></div>}

      <div className="app-directory-grid">
        {filtered.slice(0, visible).map(app => (
          <article className="app-directory-card" key={app.slug}>
            <div className="app-directory-card-top">
              <span className={`app-directory-monogram app-directory-monogram--${app.mode}`}>{appMonogram(app.name)}</span>
              <span className={`app-directory-status app-directory-status--${app.mode}`}>
                {app.mode === 'native' ? <CheckCircle2 size={11} /> : app.mode === 'oauth' ? <KeyRound size={11} /> : <Webhook size={11} />}
                {modeLabel(app)}
              </span>
            </div>
            <small>{app.category}</small>
            <h3>{app.name}</h3>
            <p>{app.mode === 'native'
              ? 'Use a typed AgentForge action with encrypted credentials and observable execution.'
              : app.mode === 'oauth'
                ? 'The consent foundation is ready; provider permissions determine available operations.'
                : 'Connect through managed auth when configured, or use the universal API and signed-webhook path now.'}</p>
            <div className="app-directory-card-actions">
              <button type="button" onClick={() => connect(app)} disabled={busy === app.slug}>
                {busy === app.slug ? 'Opening...' : workspace ? 'Connect app' : 'Start connecting'} <ArrowRight size={13} />
              </button>
              {workspace && app.mode === 'bridge' && (
                <button className="secondary" type="button" onClick={() => navigate(`/credentials?app=${encodeURIComponent(app.slug)}`)} title="Store an API key instead">
                  <KeyRound size={13} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {!filtered.length && <div className="app-directory-empty"><Unplug size={24} /><h3>No exact match</h3><p>Use the universal HTTP action or a signed webhook to connect an app that is not cataloged yet.</p></div>}
      {visible < filtered.length && <button className="app-directory-more" type="button" onClick={() => setVisible(value => value + PAGE_SIZE)}>Show 30 more apps <Sparkles size={14} /></button>}

      <div className="app-directory-contract">
        <ShieldCheck size={18} />
        <div><strong>Connection labels mean something.</strong><span>Native is built and executed by AgentForge. OAuth ready requires provider configuration. External bridge requires a Pipedream project. Universal HTTP and signed webhooks work independently.</span></div>
        <a href="https://github.com/PipedreamHQ/pipedream" target="_blank" rel="noreferrer">Catalog source <ExternalLink size={13} /></a>
      </div>
    </section>
  )
}
