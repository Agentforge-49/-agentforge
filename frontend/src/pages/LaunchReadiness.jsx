import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive, Check, CheckCircle2, Circle, Download, Gauge, RefreshCw,
  RotateCcw, Server, ShieldCheck, TriangleAlert, X,
} from 'lucide-react'

import {
  createRecoverySnapshot,
  downloadRecoverySnapshot,
  getLaunchReadiness,
  runLaunchReadiness,
  updateOnboarding,
  verifyRecoverySnapshot,
} from '../lib/api'

const panel = { background:'#13151C', border:'1px solid #252837', borderRadius:14, padding:18 }
const button = {
  border:0, borderRadius:8, padding:'9px 13px', background:'#7C3AED',
  color:'white', cursor:'pointer', display:'inline-flex', alignItems:'center',
  justifyContent:'center', gap:7,
}
const quietButton = { ...button, background:'#252837', color:'#D4D4D8' }
const STEP_DETAILS = {
  profile:['Profile and authentication', 'Confirm your identity and account access.'],
  agent:['Publish an agent', 'Create, test, version, and publish at least one agent.'],
  workflow:['Activate a workflow', 'Validate the graph and activate an automation.'],
  guardrails:['Set cost guardrails', 'Configure a personal budget and hard execution limit.'],
  developer:['Review developer access', 'Create only the scoped keys and webhooks you need.'],
  recovery:['Verify recovery', 'Export and dry-run a secret-free recovery snapshot.'],
}

export default function LaunchReadiness() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await getLaunchReadiness())
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    const interval = setInterval(load, 15000)
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

  const completed = data?.onboarding?.completed_steps || []
  const toggleStep = step => {
    const next = completed.includes(step)
      ? completed.filter(item => item !== step)
      : [...completed, step]
    act(`step-${step}`, () => updateOnboarding(next), 'Launch guide updated.')
  }

  const latestReadiness = data?.readiness_runs?.[0] || null
  const latestVerifications = useMemo(() => new Map(
    (data?.recovery_verifications || []).map(item => [item.snapshot_id, item]),
  ), [data])

  if (!data) return <div style={{ color:'#8B8FA3', padding:30 }}>{error || 'Loading launch controls…'}</div>

  return (
    <div style={{ maxWidth:1220, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'end', gap:15, marginBottom:20 }}>
        <div>
          <h1 style={{ margin:'0 0 5px', fontSize:25 }}>Launch readiness</h1>
          <p style={{ margin:0, color:'#8B8FA3', fontSize:13 }}>
            Guided onboarding, operational status, secret-free recovery, restore dry runs, and final acceptance checks.
          </p>
        </div>
        <button style={quietButton} onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <Message color="#FCA5A5" border="#7F1D1D">{error}</Message>}
      {notice && <Message color="#86EFAC" border="#14532D">
        {notice}<button onClick={() => setNotice('')} style={iconButton}><X size={14} /></button>
      </Message>}

      <div style={{ ...panel, borderColor:data.platform_status.status === 'operational' ? '#14532D' : '#78350F', marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Title icon={Server}>Platform status</Title>
          <Status value={data.platform_status.status} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:9 }}>
          {data.platform_status.components.map(component => (
            <div key={component.key} style={inner}>
              <div style={{ color:'#D4D4D8', fontSize:12 }}>{component.name}</div>
              <div style={{ color:component.status === 'operational' ? '#86EFAC' : '#FBBF24', fontSize:10, marginTop:5 }}>
                {component.status}
              </div>
            </div>
          ))}
        </div>
        <div style={{ color:'#71717A', fontSize:9, marginTop:9 }}>
          Last checked {new Date(data.platform_status.checked_at).toLocaleString()} · version {data.platform_status.version}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <div style={panel}>
          <Title icon={CheckCircle2}>Guided launch path</Title>
          <p style={muted}>
            This checklist records your deliberate acceptance. Automated readiness checks remain independent.
          </p>
          {data.onboarding_steps.map((step, index) => {
            const done = completed.includes(step)
            return (
              <button key={step} onClick={() => toggleStep(step)}
                disabled={busy === `step-${step}`}
                style={{ ...row, width:'100%', background:'none', color:'white', borderTop:0, borderLeft:0, borderRight:0, cursor:'pointer', textAlign:'left' }}>
                <div style={{ display:'flex', gap:9, alignItems:'start' }}>
                  {done ? <CheckCircle2 size={17} color="#86EFAC" /> : <Circle size={17} color="#52525B" />}
                  <div>
                    <div style={{ fontSize:12 }}>{index + 1}. {STEP_DETAILS[step][0]}</div>
                    <div style={{ color:'#71717A', fontSize:10, marginTop:3 }}>{STEP_DETAILS[step][1]}</div>
                  </div>
                </div>
              </button>
            )
          })}
          <div style={{ marginTop:11, color:data.onboarding.current_step === 'complete' ? '#86EFAC' : '#FBBF24', fontSize:11 }}>
            {data.onboarding.current_step === 'complete'
              ? 'Launch guide completed.'
              : `Next step: ${STEP_DETAILS[data.onboarding.current_step]?.[0] || data.onboarding.current_step}`}
          </div>
        </div>

        <div style={panel}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start' }}>
            <Title icon={Gauge}>Acceptance score</Title>
            {latestReadiness && <Score value={latestReadiness.score} status={latestReadiness.status} />}
          </div>
          {!latestReadiness && <Empty>No acceptance run yet.</Empty>}
          {latestReadiness?.checks.map(check => (
            <div key={check.key} style={{ display:'flex', gap:8, margin:'8px 0' }}>
              {check.passed
                ? <Check size={13} color="#86EFAC" />
                : check.critical
                  ? <X size={13} color="#FCA5A5" />
                  : <TriangleAlert size={13} color="#FBBF24" />}
              <div>
                <div style={{ color:'#D4D4D8', fontSize:10 }}>{check.name}</div>
                <div style={{ color:'#71717A', fontSize:9 }}>{check.detail}</div>
              </div>
            </div>
          ))}
          <button style={{ ...button, marginTop:10 }} disabled={busy === 'readiness'}
            onClick={() => act('readiness', runLaunchReadiness, 'Launch acceptance checks completed.')}>
            <ShieldCheck size={14} /> Run acceptance checks
          </button>
          <p style={muted}>
            Critical platform failures block launch. Optional product checks produce warnings so you can ship deliberately.
          </p>
        </div>
      </div>

      <div style={{ ...panel, marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', gap:12 }}>
          <div>
            <Title icon={Archive}>Recovery snapshots</Title>
            <p style={{ ...muted, maxWidth:720 }}>
              Exports contain configuration and ownership references only. Credentials, signing secrets,
              API keys, document contents, memory, and run data are deliberately excluded.
            </p>
          </div>
          <button style={button} disabled={busy === 'snapshot'}
            onClick={() => act('snapshot', createRecoverySnapshot, 'Recovery snapshot created.')}>
            <Archive size={14} /> Create snapshot
          </button>
        </div>
        <div style={{ ...inner, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:11 }}>
          <Metric label="Retention" value={`${data.recovery_policy.retention_days} days`} />
          <Metric label="Restore mode" value="Dry run" />
          <Metric label="Secrets" value="Excluded" />
          <Metric label="Maximum size" value="2 MB" />
        </div>
        {!data.recovery_snapshots.length && <Empty>No recovery snapshots yet.</Empty>}
        {data.recovery_snapshots.map(snapshot => {
          const verification = latestVerifications.get(snapshot.id)
          return (
            <div key={snapshot.id} style={row}>
              <div>
                <div style={{ fontSize:11 }}>
                  Snapshot {snapshot.id.slice(0, 8)} <Status value={snapshot.status} />
                  {verification && <Status value={verification.status} />}
                </div>
                <code style={{ color:'#A78BFA', fontSize:9 }}>{snapshot.manifest_sha256.slice(0, 20)}…</code>
                <div style={{ color:'#71717A', fontSize:9 }}>
                  {Object.entries(snapshot.resource_counts || {}).map(([key, count]) => `${key}: ${count}`).join(' · ')}
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button style={quietButton} onClick={async () => {
                  const hash = await downloadRecoverySnapshot(snapshot.id)
                  setNotice(`Snapshot downloaded. SHA-256: ${hash}`)
                }}>
                  <Download size={13} /> Download
                </button>
                <button style={quietButton} disabled={busy === `verify-${snapshot.id}`}
                  onClick={() => act(`verify-${snapshot.id}`,
                    () => verifyRecoverySnapshot(snapshot.id), 'Recovery dry run passed.')}>
                  <RotateCcw size={13} /> Verify dry run
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div style={panel}>
        <Title icon={ShieldCheck}>Launch policy</Title>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:9 }}>
          {[
            ['No hidden spending', 'Billing remains in sandbox until a provider is explicitly configured.'],
            ['No secret backups', 'Recovery exports exclude all credentials and sensitive runtime content.'],
            ['No destructive restore', 'Restore verification is dry-run only until an approved recovery event.'],
            ['Fail-closed access', 'API keys, SCIM, webhooks, and organization actions require explicit authorization.'],
            ['Observable execution', 'Runs, approvals, usage, webhooks, governance, and billing have durable audit trails.'],
            ['Recoverable operations', 'Snapshots are hashed, downloadable, expiring, and independently verifiable.'],
          ].map(([name, description]) => (
            <div key={name} style={inner}>
              <div style={{ color:'#D4D4D8', fontSize:11 }}>{name}</div>
              <div style={{ color:'#71717A', fontSize:9, lineHeight:1.5, marginTop:4 }}>{description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Title({ icon:Icon, children }) {
  return <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
    <Icon size={17} color="#A78BFA" /><h2 style={{ fontSize:16, margin:0 }}>{children}</h2>
  </div>
}
function Status({ value }) {
  const good = ['operational', 'ready', 'passed'].includes(value)
  const warning = ['warning', 'expired'].includes(value)
  return <span style={{
    borderRadius:20, padding:'3px 7px', marginLeft:5, fontSize:9,
    background:good ? '#14532D' : warning ? '#3F2A0B' : '#3F1D2A',
    color:good ? '#86EFAC' : warning ? '#FBBF24' : '#FCA5A5',
  }}>{value}</span>
}
function Score({ value, status }) {
  return <div style={{ textAlign:'right' }}>
    <div style={{ fontSize:28, color:status === 'passed' ? '#86EFAC' : '#FBBF24' }}>{value}%</div>
    <Status value={status} />
  </div>
}
function Metric({ label, value }) {
  return <div><div style={{ color:'#71717A', fontSize:9 }}>{label}</div>
    <div style={{ color:'#D4D4D8', fontSize:12, marginTop:3 }}>{value}</div></div>
}
function Empty({ children }) {
  return <div style={{ color:'#71717A', fontSize:11, padding:'8px 0' }}>{children}</div>
}
function Message({ color, border, children }) {
  return <div style={{ ...panel, color, borderColor:border, marginBottom:13,
    display:'flex', justifyContent:'space-between' }}>{children}</div>
}
const inner = { background:'#0D0F15', border:'1px solid #252837', borderRadius:9, padding:10 }
const row = {
  display:'flex', justifyContent:'space-between', alignItems:'center', gap:10,
  borderBottom:'1px solid #20232F', padding:'11px 0',
}
const muted = { color:'#71717A', fontSize:10, lineHeight:1.55 }
const iconButton = { border:0, background:'none', color:'#A1A1AA', cursor:'pointer' }
