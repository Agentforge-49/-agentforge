import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, RefreshCw, ShieldCheck, Trash2, XCircle } from 'lucide-react'

import {
  createCredential,
  deleteCredential,
  getCredentialAccessLogs,
  getCredentials,
  rotateCredential,
  testCredential,
} from '../lib/api'

const PROVIDERS = [
  ['generic', 'Generic secret'],
  ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'],
  ['slack', 'Slack'],
  ['github', 'GitHub'],
]

export default function Credentials() {
  const [credentials, setCredentials] = useState([])
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)
  const [form, setForm] = useState({ name:'', provider:'generic', secret:'' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState('')
  const [rotatingId, setRotatingId] = useState('')
  const [rotationSecret, setRotationSecret] = useState('')

  const load = () => getCredentials().then(setCredentials)
  useEffect(() => {
    load().catch(err => setError(err.message))
  }, [])

  const create = async event => {
    event.preventDefault()
    setError('')
    try {
      const created = await createCredential(form)
      setCredentials(items => [created, ...items])
      setForm(current => ({ ...current, name:'', secret:'' }))
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

      <form onSubmit={create} style={panel}>
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
const th = { textAlign:'left', color:'#8B8FA3', borderBottom:'1px solid #303447', padding:'8px 6px' }
const td = { color:'#C7CAD4', borderBottom:'1px solid #222637', padding:'9px 6px' }
