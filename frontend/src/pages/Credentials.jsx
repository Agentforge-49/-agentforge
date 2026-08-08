import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, KeyRound, Link2, Mail, RefreshCw, ShieldCheck, Trash2, Unplug, XCircle } from 'lucide-react'

import {
  createCredential,
  deleteOauthConnection,
  deleteCredential,
  getCredentialAccessLogs,
  getCredentials,
  getOauthConnections,
  getOauthProviders,
  rotateCredential,
  startOauthConnection,
  testCredential,
} from '../lib/api'

const PROVIDERS = [
  ['generic', 'Generic secret'],
  ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'],
  ['slack', 'Slack'],
  ['github', 'GitHub'],
  ['google', 'Google OAuth token'],
  ['resend', 'Resend'],
  ['supabase', 'Supabase'],
]

const APP_CREDENTIAL_PROVIDERS = {
  slack:'slack',
  google_sheets:'google',
  google_drive:'google',
  resend:'resend',
  supabase:'supabase',
  github:'github',
}

function oauthNotice() {
  const query = new URLSearchParams(window.location.search)
  const status = query.get('oauth')
  const provider = query.get('provider')
  if (status === 'connected') return { message:`${provider || 'App'} connected successfully.`, error:'' }
  if (status === 'error') return { message:'', error:'The app connection could not be completed. Please try again.' }
  if (status === 'cancelled') return { message:'App connection was cancelled.', error:'' }
  return { message:'', error:'' }
}

function requestedApp() {
  const value = new URLSearchParams(window.location.search).get('app') || ''
  return /^[a-z0-9][a-z0-9_-]{0,99}$/i.test(value) ? value.toLowerCase() : ''
}

export default function Credentials() {
  const initialNotice = oauthNotice()
  const initialApp = requestedApp()
  const initialProvider = APP_CREDENTIAL_PROVIDERS[initialApp] || 'generic'
  const [credentials, setCredentials] = useState([])
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)
  const [form, setForm] = useState({
    name:initialApp ? `${initialApp.replace(/[_-]+/g, ' ')} API credential` : '',
    provider:initialProvider,
    secret:'',
    project_url:'',
    app_slug:initialApp,
  })
  const [error, setError] = useState(initialNotice.error)
  const [message, setMessage] = useState(initialNotice.message)
  const [busyId, setBusyId] = useState('')
  const [rotatingId, setRotatingId] = useState('')
  const [rotationSecret, setRotationSecret] = useState('')
  const [oauthProviders, setOauthProviders] = useState([])
  const [oauthConnections, setOauthConnections] = useState([])
  const [oauthBusy, setOauthBusy] = useState('')

  const launchConnections = [
    {
      key:'slack',
      label:'Slack delivery',
      provider:'slack',
      detail:'Send approved support handoffs to a team channel.',
      ready:oauthConnections.some(item => item.provider === 'slack' && item.status === 'active')
        || credentials.some(item => item.provider === 'slack'),
      oauth:true,
    },
    {
      key:'google',
      label:'Google Workspace',
      provider:'google',
      detail:'Append lead results to Sheets and archive reports in Drive.',
      ready:oauthConnections.some(item => item.provider === 'google' && item.status === 'active')
        || credentials.some(item => item.provider === 'google'),
      oauth:true,
    },
    {
      key:'resend',
      label:'Email delivery',
      provider:'resend',
      detail:'Deliver approved reports from a verified sender through Resend.',
      ready:credentials.some(item => item.provider === 'resend'),
      oauth:false,
    },
  ]

  const load = () => getCredentials().then(setCredentials)
  useEffect(() => {
    load().catch(err => setError(err.message))
    Promise.allSettled([getOauthProviders(), getOauthConnections()]).then(([providers, connections]) => {
      if (providers.status === 'fulfilled') setOauthProviders(providers.value || [])
      if (connections.status === 'fulfilled') setOauthConnections(connections.value || [])
    })
  }, [])

  const connectOauth = async provider => {
    setOauthBusy(provider)
    setError('')
    try {
      const result = await startOauthConnection(provider)
      window.location.assign(result.authorization_url)
    } catch (err) {
      setError(err.message)
      setOauthBusy('')
    }
  }

  const disconnectOauth = async connection => {
    if (!window.confirm(`Disconnect ${connection.provider_account_name || connection.provider}?`)) return
    setOauthBusy(connection.id)
    setError('')
    try {
      await deleteOauthConnection(connection.id)
      setOauthConnections(items => items.filter(item => item.id !== connection.id))
      setMessage('App connection removed.')
    } catch (err) {
      setError(err.message)
    } finally {
      setOauthBusy('')
    }
  }

  const create = async event => {
    event.preventDefault()
    setError('')
    try {
      const created = await createCredential({
        name:form.name,
        provider:form.provider,
        secret:form.secret,
        metadata:form.provider === 'supabase'
          ? { project_url:form.project_url }
          : form.provider === 'generic' && form.app_slug
            ? { app_slug:form.app_slug }
            : {},
      })
      setCredentials(items => [created, ...items])
      setForm(current => ({ ...current, name:'', secret:'', project_url:'', app_slug:'' }))
      setMessage('Credential encrypted and stored. The plaintext was discarded.')
    } catch (err) {
      setError(err.message)
    }
  }

  const test = async credential => {
    setBusyId(credential.id)
    setError('')
    try {
      const result = await testCredential(credential.id)
      setMessage(result.message)
      await load()
    } catch (err) {
      setError(err.message)
      await load()
    } finally {
      setBusyId('')
    }
  }

  const rotate = async credential => {
    if (!rotationSecret) return
    setBusyId(credential.id)
    try {
      const updated = await rotateCredential(credential.id, rotationSecret)
      setCredentials(items => items.map(item => item.id === updated.id ? updated : item))
      setMessage(`Credential rotated to version ${updated.current_version}.`)
      setRotatingId('')
      setRotationSecret('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  const remove = async credential => {
    if (!window.confirm(`Permanently delete "${credential.name}" and every encrypted version?`)) return
    try {
      await deleteCredential(credential.id)
      setCredentials(items => items.filter(item => item.id !== credential.id))
    } catch (err) {
      setError(err.message)
    }
  }

  const openLogs = async () => {
    try {
      setLogs(await getCredentialAccessLogs())
      setShowLogs(true)
    } catch (err) {
      setError(err.message)
    }
  }

  const prepareManual = connection => {
    setForm(current => ({
      ...current,
      name:connection.key === 'resend' ? 'Resend production key' : `${connection.label} token`,
      provider:connection.provider,
      secret:'',
    }))
    document.getElementById('store-credential')?.scrollIntoView({ behavior:'smooth', block:'start' })
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', marginBottom:22 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:600, marginBottom:5 }}>Credential Vault</h1>
          <p style={{ color:'#9CA3AF', fontSize:13 }}>Encrypted secrets with redaction, rotation, safe tests, and an access trail.</p>
        </div>
        <button onClick={openLogs} style={secondaryButton}>View access log</button>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {message && <div style={successBox}>{message}</div>}

      <section className="connection-launch-center">
        <div className="connection-launch-heading">
          <div><span>Launch connections</span><h2>Connect the three tools used by flagship workflows.</h2></div>
          <p>Start with one connection. You do not need every provider to install your first workflow.</p>
        </div>
        <div className="connection-launch-grid">
          {launchConnections.map(connection => {
            const provider = oauthProviders.find(item => item.provider === connection.provider)
            return (
              <article key={connection.key}>
                <div className="connection-launch-card-top">
                  <span>{connection.key === 'resend' ? <Mail size={18} /> : <Link2 size={18} />}</span>
                  <strong className={connection.ready ? 'ready' : ''}>
                    {connection.ready ? <><CheckCircle2 size={12} /> Ready</> : 'Setup needed'}
                  </strong>
                </div>
                <h3>{connection.label}</h3>
                <p>{connection.detail}</p>
                {!connection.ready && connection.oauth && provider?.configured && (
                  <button type="button" disabled={oauthBusy === connection.provider}
                    onClick={() => connectOauth(connection.provider)}>
                    Connect with consent <ArrowRight size={13} />
                  </button>
                )}
                {!connection.ready && (!connection.oauth || !provider?.configured) && (
                  <button type="button" onClick={() => prepareManual(connection)}>
                    Store secure credential <ArrowRight size={13} />
                  </button>
                )}
                {connection.ready && <small>Available in the starter-kit installer and workflow builder.</small>}
              </article>
            )
          })}
        </div>
      </section>

      <section style={{ ...panel, marginBottom:18 }}>
        <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:4 }}>
          <Link2 size={19} color="#34D399" />
          <h2 style={{ fontSize:15 }}>Connected apps</h2>
        </div>
        <p style={{ color:'#8B8FA3', fontSize:12, marginBottom:14 }}>
          Connect with provider consent instead of copying long-lived tokens into workflows.
        </p>
        {oauthProviders.length === 0 ? (
          <p style={{ color:'#6B7280', fontSize:12 }}>OAuth providers will appear when the cloud connection layer is available.</p>
        ) : (
          <div style={grid}>
            {oauthProviders.map(provider => {
              const connections = oauthConnections.filter(item => item.provider === provider.provider)
              return (
                <div key={provider.provider} style={oauthCard}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
                    <div>
                      <strong style={{ fontSize:13 }}>{provider.label}</strong>
                      <div style={{ color:provider.configured ? '#6EE7B7' : '#FCD34D', fontSize:10, marginTop:4 }}>
                        {provider.configured ? 'Ready to connect' : 'Provider setup required'}
                      </div>
                    </div>
                    {connections.length > 0 && <CheckCircle2 size={17} color="#34D399" />}
                  </div>
                  {connections.map(connection => (
                    <div key={connection.id} style={oauthConnection}>
                      <span>{connection.provider_account_name || 'Connected account'}</span>
                      <button
                        type="button"
                        disabled={oauthBusy === connection.id}
                        onClick={() => disconnectOauth(connection)}
                        style={iconButton}
                        aria-label={`Disconnect ${connection.provider_account_name || provider.label}`}
                      >
                        <Unplug size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={!provider.configured || oauthBusy === provider.provider}
                    onClick={() => connectOauth(provider.provider)}
                    style={{ ...secondaryButton, width:'100%', justifyContent:'center', marginTop:10, opacity:provider.configured ? 1 : .5 }}
                  >
                    <Link2 size={12} /> {connections.length ? 'Connect another' : 'Connect'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <form id="store-credential" onSubmit={create} style={panel}>
        <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:14 }}>
          <ShieldCheck size={19} color="#A78BFA" />
          <h2 style={{ fontSize:15 }}>Store a credential</h2>
        </div>
        <div style={grid}>
          <div>
            <label style={label}>Name</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name:e.target.value })}
              placeholder="Production OpenAI key" style={input} />
          </div>
          <div>
            <label style={label}>Provider</label>
            <select value={form.provider} onChange={e => setForm({ ...form, provider:e.target.value })} style={input}>
              {PROVIDERS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Secret</label>
            <input required type="password" minLength="8" value={form.secret}
              onChange={e => setForm({ ...form, secret:e.target.value })}
              autoComplete="new-password" placeholder="Will be encrypted immediately" style={input} />
          </div>
          {form.provider === 'supabase' && <div>
            <label style={label}>Project URL</label>
            <input required type="url" value={form.project_url}
              onChange={e => setForm({ ...form, project_url:e.target.value })}
              placeholder="https://project.supabase.co" style={input} />
          </div>}
          {form.provider === 'generic' && <div>
            <label style={label}>App identifier</label>
            <input value={form.app_slug} onChange={e => setForm({ ...form, app_slug:e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 100) })}
              placeholder="hubspot" style={input} />
          </div>}
        </div>
        <p style={{ color:'#6B7280', fontSize:11, marginTop:10 }}>Secrets use authenticated AES-256-GCM encryption. Plaintext is never returned by the API.</p>
        <button style={primaryButton}><KeyRound size={14} /> Encrypt and store</button>
      </form>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14, marginTop:18 }}>
        {credentials.map(credential => <div key={credential.id} style={panel}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
            <div>
              <h3 style={{ fontSize:15 }}>{credential.name}</h3>
              <p style={{ color:'#8B8FA3', fontSize:11, marginTop:4 }}>{credential.provider} · version {credential.current_version}</p>
            </div>
            {credential.last_test_status === 'passed'
              ? <CheckCircle2 size={18} color="#34D399" />
              : credential.last_test_status === 'failed'
                ? <XCircle size={18} color="#F87171" />
                : <ShieldCheck size={18} color="#6B7280" />}
          </div>
          <code style={{ display:'block', background:'#101219', border:'1px solid #2D3142', borderRadius:8, padding:10, marginTop:14, color:'#D1D5DB' }}>
            {credential.masked_secret}
          </code>
          <div style={{ color:'#6B7280', fontSize:10, marginTop:9 }}>
            Rotated {new Date(credential.rotated_at).toLocaleString()}
            {credential.last_tested_at && <> · tested {new Date(credential.last_tested_at).toLocaleString()}</>}
          </div>
          <div style={actions}>
            <button disabled={busyId === credential.id} onClick={() => test(credential)} style={secondaryButton}>
              <ShieldCheck size={12} /> Test
            </button>
            <button disabled={busyId === credential.id} onClick={() => { setRotatingId(credential.id); setRotationSecret('') }} style={secondaryButton}>
              <RefreshCw size={12} /> Rotate
            </button>
            <button onClick={() => remove(credential)} style={dangerButton}><Trash2 size={12} /></button>
          </div>
          {rotatingId === credential.id && <div style={{ marginTop:10 }}>
            <label style={label}>Replacement secret</label>
            <input type="password" minLength="8" value={rotationSecret}
              onChange={event => setRotationSecret(event.target.value)}
              autoComplete="new-password" style={input} />
            <div style={{ display:'flex', gap:7, marginTop:8 }}>
              <button disabled={rotationSecret.length < 8 || busyId === credential.id}
                onClick={() => rotate(credential)} style={primaryButton}>Save rotation</button>
              <button onClick={() => { setRotatingId(''); setRotationSecret('') }} style={secondaryButton}>Cancel</button>
            </div>
          </div>}
        </div>)}
      </div>

      {showLogs && <div style={{ ...panel, marginTop:18 }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <h3 style={{ fontSize:15 }}>Credential access log</h3>
          <button onClick={() => setShowLogs(false)} style={secondaryButton}>Close</button>
        </div>
        <div style={{ overflowX:'auto', marginTop:12 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead><tr>{['Time','Credential','Operation','Outcome','Details'].map(item => <th key={item} style={th}>{item}</th>)}</tr></thead>
            <tbody>{logs.map(log => <tr key={log.id}>
              <td style={td}>{new Date(log.created_at).toLocaleString()}</td>
              <td style={td}>{log.credential_name}</td>
              <td style={td}>{log.operation}</td>
              <td style={td}>{log.outcome}</td>
              <td style={td}>{log.details || '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>}
    </div>
  )
}

const panel = { background:'#171A23', border:'1px solid #292D3D', borderRadius:14, padding:18 }
const grid = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))', gap:12 }
const label = { display:'block', color:'#9CA3AF', fontSize:11, marginBottom:6 }
const input = { boxSizing:'border-box', width:'100%', background:'#101219', border:'1px solid #303447', borderRadius:8, color:'#E5E7EB', padding:'9px 10px', fontSize:12 }
const primaryButton = { display:'inline-flex', alignItems:'center', gap:6, background:'#7C3AED', color:'white', border:0, borderRadius:8, padding:'9px 13px', cursor:'pointer', marginTop:14 }
const secondaryButton = { display:'inline-flex', alignItems:'center', gap:5, background:'#202431', color:'#C7CAD4', border:'1px solid #34394D', borderRadius:7, padding:'7px 9px', cursor:'pointer', fontSize:11 }
const dangerButton = { ...secondaryButton, color:'#FCA5A5' }
const actions = { display:'flex', gap:7, marginTop:14, paddingTop:12, borderTop:'1px solid #292D3D' }
const errorBox = { background:'#2D1515', border:'1px solid #EF4444', borderRadius:9, padding:11, color:'#FCA5A5', fontSize:12, marginBottom:14 }
const successBox = { background:'#0B2A20', border:'1px solid #059669', borderRadius:9, padding:11, color:'#6EE7B7', fontSize:12, marginBottom:14 }
const oauthCard = { background:'#101219', border:'1px solid #2D3142', borderRadius:10, padding:13 }
const oauthConnection = { display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginTop:9, color:'#C7CAD4', fontSize:11 }
const iconButton = { display:'grid', placeItems:'center', border:'1px solid #3B4158', borderRadius:6, padding:5, color:'#FCA5A5', background:'#202431', cursor:'pointer' }
const th = { textAlign:'left', color:'#8B8FA3', borderBottom:'1px solid #303447', padding:'8px 6px' }
const td = { color:'#C7CAD4', borderBottom:'1px solid #222637', padding:'9px 6px' }
