import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Braces, Check, Clipboard, Code2, KeyRound, Pause, Play,
  RefreshCw, RotateCcw, Send, ShieldCheck, Trash2, Webhook, X,
} from 'lucide-react'

import {
  createDeveloperKey,
  createDeveloperWebhook,
  getDeveloperPlatform,
  retryDeveloperDelivery,
  revokeDeveloperKey,
  revokeDeveloperWebhook,
  sendDeveloperWebhookTest,
  updateDeveloperWebhook,
} from '../lib/api'

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/v1`
const panel = { background:'#13151C', border:'1px solid #252837', borderRadius:14, padding:18 }
const field = {
  width:'100%', boxSizing:'border-box', color:'#F4F4F5', background:'#0D0F15',
  border:'1px solid #2B2E3D', borderRadius:8, padding:'9px 11px',
}
const button = {
  border:0, borderRadius:8, padding:'9px 13px', background:'#7C3AED',
  color:'white', cursor:'pointer', display:'inline-flex', alignItems:'center',
  justifyContent:'center', gap:7,
}
const quietButton = { ...button, background:'#252837', color:'#D4D4D8' }

export default function DeveloperPlatform() {
  const [data, setData] = useState(null)
  const [keyForm, setKeyForm] = useState({
    name:'Production integration',
    scopes:['agents:read', 'runs:read', 'status:read'],
    rate_limit_per_minute:60,
    expiry_days:90,
  })
  const [webhookForm, setWebhookForm] = useState({
    name:'Run notifications',
    endpoint_url:'',
    event_types:['agent.run.completed', 'agent.run.failed'],
    max_attempts:5,
  })
  const [shownKey, setShownKey] = useState('')
  const [shownSecret, setShownSecret] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const result = await getDeveloperPlatform()
      setData(result)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    const interval = setInterval(load, 10000)
    return () => { clearTimeout(timer); clearInterval(interval) }
  }, [load])

  const act = async (key, action, message) => {
    setBusy(key)
    try {
      const result = await action()
      setError('')
      setNotice(message)
      await load()
      return result
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setBusy('')
    }
  }

  const createKey = async event => {
    event.preventDefault()
    const result = await act('key', () => createDeveloperKey({
      ...keyForm,
      rate_limit_per_minute:Number(keyForm.rate_limit_per_minute),
      expiry_days:keyForm.expiry_days === '' ? null : Number(keyForm.expiry_days),
    }), 'API key created. Copy it now.')
    if (result) setShownKey(result.token)
  }

  const createWebhook = async event => {
    event.preventDefault()
    const result = await act('webhook', () => createDeveloperWebhook({
      ...webhookForm,
      max_attempts:Number(webhookForm.max_attempts),
    }), 'Webhook subscription created. Copy its signing secret now.')
    if (result) {
      setShownSecret(result.signing_secret)
      setWebhookForm(current => ({ ...current, endpoint_url:'' }))
    }
  }

  const curlExample = useMemo(() => (
    `curl "${API_BASE}/agents" \\\n  -H "X-AgentForge-Key: ${shownKey || 'YOUR_API_KEY'}"`
  ), [shownKey])

  if (!data) return <div style={{ color:'#8B8FA3', padding:30 }}>{error || 'Loading developer platform…'}</div>

  return (
    <div style={{ maxWidth:1240, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'end', gap:15, marginBottom:20 }}>
        <div>
          <h1 style={{ margin:'0 0 5px', fontSize:25 }}>Developer platform</h1>
          <p style={{ margin:0, color:'#8B8FA3', fontSize:13 }}>
            Scoped API keys, atomic rate limits, durable signed webhooks, request audit, and OpenAPI contracts.
          </p>
        </div>
        <button style={quietButton} onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <Message color="#FCA5A5" border="#7F1D1D">{error}</Message>}
      {notice && <Message color="#86EFAC" border="#14532D">
        {notice}<button onClick={() => setNotice('')} style={iconButton}><X size={14} /></button>
      </Message>}

      {(shownKey || shownSecret) && (
        <div style={{ ...panel, borderColor:'#78350F', marginBottom:14 }}>
          <div style={{ color:'#FBBF24', fontWeight:600, fontSize:12 }}>
            One-time credential — it will not be shown again.
          </div>
          {shownKey && <Secret label="API key" value={shownKey} onClose={() => setShownKey('')} />}
          {shownSecret && <Secret label="Webhook signing secret" value={shownSecret} onClose={() => setShownSecret('')} />}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <form onSubmit={createKey} style={panel}>
          <Title icon={KeyRound}>Create scoped API key</Title>
          <Label>Name</Label>
          <input style={field} value={keyForm.name}
            onChange={event => setKeyForm({ ...keyForm, name:event.target.value })} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
            <div><Label>Requests per minute</Label>
              <input style={field} type="number" min="10" max="600"
                value={keyForm.rate_limit_per_minute}
                onChange={event => setKeyForm({ ...keyForm, rate_limit_per_minute:event.target.value })} />
            </div>
            <div><Label>Expires in days</Label>
              <input style={field} type="number" min="1" max="365" placeholder="Blank = no expiry"
                value={keyForm.expiry_days}
                onChange={event => setKeyForm({ ...keyForm, expiry_days:event.target.value })} />
            </div>
          </div>
          <Label>Least-privilege scopes</Label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:12 }}>
            {data.scopes.map(scope => (
              <label key={scope} style={{ color:'#A1A1AA', fontSize:10 }}>
                <input type="checkbox" checked={keyForm.scopes.includes(scope)}
                  onChange={() => setKeyForm({
                    ...keyForm,
                    scopes:keyForm.scopes.includes(scope)
                      ? keyForm.scopes.filter(item => item !== scope)
                      : [...keyForm.scopes, scope],
                  })} /> {scope}
              </label>
            ))}
          </div>
          <button style={button} disabled={busy === 'key'}><KeyRound size={14} /> Create key</button>
        </form>

        <div style={panel}>
          <Title icon={Code2}>Quick start</Title>
          <div style={codeBox}>
            <code style={{ whiteSpace:'pre-wrap', color:'#D8B4FE', fontSize:10 }}>{curlExample}</code>
            <CopyButton value={curlExample} />
          </div>
          <div style={{ ...codeBox, marginTop:10 }}>
            <code style={{ color:'#A1A1AA', fontSize:10 }}>
              GET {API_BASE}/status<br />
              GET {API_BASE}/agents<br />
              POST {API_BASE}/agents/:id/run<br />
              GET {API_BASE}/workflows<br />
              POST {API_BASE}/workflows/:id/run<br />
              GET {API_BASE}/runs<br />
              GET {API_BASE}/usage
            </code>
          </div>
          <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}${data.openapi_url}`}
            target="_blank" rel="noreferrer"
            style={{ ...button, textDecoration:'none', marginTop:11 }}>
            <Braces size={14} /> OpenAPI 3.1 JSON
          </a>
          <p style={muted}>
            Every response includes a request ID. Rate-limit headers expose limit, remaining requests, and reset time.
          </p>
        </div>
      </div>

      <div style={{ ...panel, marginBottom:14 }}>
        <Title icon={ShieldCheck}>API keys</Title>
        {!data.keys.length && <Empty>No API keys yet.</Empty>}
        {data.keys.map(item => (
          <div key={item.id} style={row}>
            <div>
              <div style={{ fontSize:12 }}>{item.name} <Status value={item.status} /></div>
              <code style={{ color:'#A78BFA', fontSize:10 }}>{item.key_prefix}…</code>
              <div style={{ color:'#71717A', fontSize:9 }}>
                {item.rate_limit_per_minute}/min · {item.scopes.join(', ')} ·
                {item.last_used_at ? ` used ${new Date(item.last_used_at).toLocaleString()}` : ' never used'}
              </div>
            </div>
            {item.status === 'active' && (
              <button style={{ ...quietButton, color:'#FCA5A5' }}
                onClick={() => act(`key-${item.id}`, () => revokeDeveloperKey(item.id), 'API key revoked.')}>
                <Trash2 size={13} /> Revoke
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <form onSubmit={createWebhook} style={panel}>
          <Title icon={Webhook}>Signed webhook subscription</Title>
          <Label>Name</Label>
          <input style={field} value={webhookForm.name}
            onChange={event => setWebhookForm({ ...webhookForm, name:event.target.value })} />
          <Label>Public HTTPS endpoint</Label>
          <input style={field} type="url" required placeholder="https://example.com/agentforge"
            value={webhookForm.endpoint_url}
            onChange={event => setWebhookForm({ ...webhookForm, endpoint_url:event.target.value })} />
          <Label>Events</Label>
          <div style={{ display:'grid', gap:5, marginBottom:10 }}>
            {data.webhook_event_types.filter(item => item !== '*').map(eventType => (
              <label key={eventType} style={{ color:'#A1A1AA', fontSize:10 }}>
                <input type="checkbox" checked={webhookForm.event_types.includes(eventType)}
                  onChange={() => setWebhookForm({
                    ...webhookForm,
                    event_types:webhookForm.event_types.includes(eventType)
                      ? webhookForm.event_types.filter(item => item !== eventType)
                      : [...webhookForm.event_types, eventType],
                  })} /> {eventType}
              </label>
            ))}
          </div>
          <button style={button} disabled={busy === 'webhook'}><Webhook size={14} /> Create subscription</button>
        </form>

        <div style={panel}>
          <Title icon={Send}>Delivery guarantees</Title>
          {[
            'HMAC-SHA256 signature with timestamp',
            'Stable event ID for receiver idempotency',
            'Public HTTPS and DNS rebinding protection',
            '10-second timeout and redirect blocking',
            'Exponential retries with bounded attempts',
            'Dead-letter state and manual retry',
            'Response body stored only as SHA-256',
          ].map(item => <div key={item} style={{ color:'#A1A1AA', fontSize:11, margin:'8px 0' }}>
            <Check size={12} color="#86EFAC" /> {item}
          </div>)}
          <button style={quietButton} onClick={() => act('test', sendDeveloperWebhookTest,
            'Test event queued for active subscriptions.')} disabled={busy === 'test'}>
            <Send size={13} /> Queue test event
          </button>
        </div>
      </div>

      <div style={{ ...panel, marginBottom:14 }}>
        <Title icon={Webhook}>Webhook subscriptions</Title>
        {!data.webhook_subscriptions.length && <Empty>No webhook subscriptions.</Empty>}
        {data.webhook_subscriptions.map(item => (
          <div key={item.id} style={row}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12 }}>{item.name} <Status value={item.status} /></div>
              <div style={{ color:'#8B8FA3', fontSize:10, overflow:'hidden', textOverflow:'ellipsis' }}>
                {item.endpoint_url}
              </div>
              <div style={{ color:'#71717A', fontSize:9 }}>
                secret ••••{item.secret_last_four} · {item.event_types.join(', ')}
              </div>
            </div>
            {item.status !== 'revoked' && <div style={{ display:'flex', gap:6 }}>
              <button style={quietButton} onClick={() => act(`toggle-${item.id}`,
                () => updateDeveloperWebhook(item.id, item.status === 'active' ? 'paused' : 'active'),
                `Webhook ${item.status === 'active' ? 'paused' : 'activated'}.`)}>
                {item.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <button style={{ ...quietButton, color:'#FCA5A5' }}
                onClick={() => act(`revoke-${item.id}`, () => revokeDeveloperWebhook(item.id), 'Webhook revoked.')}>
                <Trash2 size={13} />
              </button>
            </div>}
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div style={panel}>
          <Title icon={Send}>Recent deliveries</Title>
          {!data.webhook_deliveries.length && <Empty>No deliveries yet.</Empty>}
          {data.webhook_deliveries.slice(0, 20).map(item => (
            <div key={item.id} style={row}>
              <div>
                <Status value={item.status} />
                <div style={{ color:'#71717A', fontSize:9 }}>
                  attempt {item.attempt}/{item.max_attempts} · HTTP {item.response_status || '—'} · {item.error_code || 'no error'}
                </div>
              </div>
              {item.status === 'dead_letter' && (
                <button style={quietButton} onClick={() => act(`retry-${item.id}`,
                  () => retryDeveloperDelivery(item.id), 'Delivery queued again.')}>
                  <RotateCcw size={13} /> Retry
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={panel}>
          <Title icon={Braces}>API request audit</Title>
          {!data.request_logs.length && <Empty>No API requests yet.</Empty>}
          {data.request_logs.slice(0, 20).map(item => (
            <div key={item.id} style={row}>
              <div>
                <div style={{ fontSize:10 }}>{item.method} {item.path}</div>
                <div style={{ color:'#71717A', fontSize:9 }}>{item.request_id}</div>
              </div>
              <div style={{ fontSize:10, color:item.status_code < 400 ? '#86EFAC' : '#FCA5A5' }}>
                {item.status_code} · {item.duration_ms}ms
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Title({ icon:Icon, children }) {
  return <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10 }}>
    <Icon size={17} color="#A78BFA" /><h2 style={{ fontSize:16, margin:0 }}>{children}</h2>
  </div>
}
function Label({ children }) {
  return <label style={{ display:'block', color:'#8B8FA3', fontSize:10, margin:'10px 0 5px' }}>{children}</label>
}
function Secret({ label, value, onClose }) {
  return <div style={{ ...codeBox, display:'flex', alignItems:'center', gap:8 }}>
    <span style={{ color:'#8B8FA3', fontSize:10 }}>{label}</span>
    <code style={{ color:'#FDE68A', fontSize:10, flex:1, wordBreak:'break-all' }}>{value}</code>
    <CopyButton value={value} /><button style={iconButton} onClick={onClose}><X size={13} /></button>
  </div>
}
function CopyButton({ value }) {
  return <button type="button" style={iconButton} onClick={() => navigator.clipboard?.writeText(value)}>
    <Clipboard size={13} />
  </button>
}
function Status({ value }) {
  const good = ['active', 'delivered'].includes(value)
  const warning = ['paused', 'pending', 'retry_wait', 'delivering'].includes(value)
  return <span style={{
    borderRadius:20, padding:'3px 6px', fontSize:9,
    background:good ? '#14532D' : warning ? '#3F2A0B' : '#3F1D2A',
    color:good ? '#86EFAC' : warning ? '#FBBF24' : '#FCA5A5',
  }}>{value}</span>
}
function Empty({ children }) {
  return <div style={{ color:'#71717A', fontSize:11, padding:'8px 0' }}>{children}</div>
}
function Message({ color, border, children }) {
  return <div style={{ ...panel, color, borderColor:border, marginBottom:13,
    display:'flex', justifyContent:'space-between' }}>{children}</div>
}
const codeBox = { background:'#0D0F15', border:'1px solid #252837', borderRadius:9, padding:10, marginTop:8 }
const iconButton = { border:0, background:'none', color:'#A1A1AA', cursor:'pointer', padding:3 }
const muted = { color:'#71717A', fontSize:10, lineHeight:1.55 }
const row = {
  display:'flex', justifyContent:'space-between', alignItems:'center', gap:10,
  borderBottom:'1px solid #20232F', padding:'10px 0',
}
