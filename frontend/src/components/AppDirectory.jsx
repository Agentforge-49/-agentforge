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
import AppLogo from './AppLogo.jsx'
import './AppDirectory.css'

const PAGE_SIZE = 30

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
      navigate(`/credentials?app=custom_api&target=${encodeURIComponent(app.slug)}`)
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
    return bridge.configured ? 'Managed connection' : 'Catalog only'
  }

  return (
    <section className={`app-directory${workspace ? ' app-directory--workspace' : ''}`}>
      <div className="app-directory-summary">
        <div><strong>{INTEGRATION_COUNTS.catalog.toLocaleString()}</strong><span>apps you can discover</span></div>
        <div><strong>{INTEGRATION_COUNTS.native}</strong><span>native connectors now</span></div>
        <div><strong>{INTEGRATION_COUNTS.bridge.toLocaleString()}</strong><span>via API or managed bridge</span></div>
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
            ['all','All apps'],['native','Native now'],['oauth','OAuth ready'],['bridge','API / bridge'],
          ].filter(([value]) => value !== 'oauth' || INTEGRATION_COUNTS.oauthReady > 0).map(([value, label]) => (
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
              <AppLogo slug={app.slug} name={app.name} />
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
                : 'Listed for compatibility. Use its API or a signed webhook now; one-click OAuth requires the optional managed bridge.'}</p>
            <div className="app-directory-card-actions">
              <button type="button" onClick={() => connect(app)} disabled={busy === app.slug}>
                {busy === app.slug ? 'Opening...' : !workspace ? 'See connection options' : app.mode === 'native' ? 'Set up connector' : bridge.configured ? 'Connect with OAuth' : 'Use API or webhook'} <ArrowRight size={13} />
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
