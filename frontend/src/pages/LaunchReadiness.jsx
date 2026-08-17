import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive, Check, CheckCircle2, Circle, Download, Gauge, RefreshCw,
  RotateCcw, Server, ShieldCheck, TriangleAlert, X,
} from 'lucide-react'

import {
  createRecoverySnapshot, downloadRecoverySnapshot, getLaunchReadiness,
  runLaunchReadiness, updateOnboarding, verifyRecoverySnapshot,
} from '../lib/api'

const STEP_DETAILS = {
  profile:['Profile and authentication', 'Confirm identity and account access.'],
  agent:['Publish an agent', 'Create, test, version, and publish one agent.'],
  workflow:['Activate a workflow', 'Validate the graph and activate an automation.'],
  guardrails:['Set cost guardrails', 'Configure a personal budget and hard execution limit.'],
  developer:['Review developer access', 'Keep only the scoped keys and webhooks you need.'],
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
      setError(err.message || 'Release controls could not be loaded.')
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    const interval = setInterval(load, 15000)
    return () => { clearTimeout(timer); clearInterval(interval) }
  }, [load])

  const act = async (key, action, message) => {
    setBusy(key)
    setNotice('')
    try {
      const result = await action()
      setError('')
      setNotice(message)
      await load()
      return result
    } catch (err) {
      setError(err.message || 'The operation could not be completed.')
      return null
    } finally {
      setBusy('')
    }
  }

  const completed = data?.onboarding?.completed_steps || []
  const toggleStep = step => {
    const next = completed.includes(step) ? completed.filter(item => item !== step) : [...completed, step]
    act(`step-${step}`, () => updateOnboarding(next), 'Release guide updated.')
  }
  const latestReadiness = data?.readiness_runs?.[0] || null
  const latestVerifications = useMemo(() => new Map(
    (data?.recovery_verifications || []).map(item => [item.snapshot_id, item]),
  ), [data])

  if (!data) return <div className="workspace-loading" role="status">
    <div className="workspace-loading-card"><span className="workspace-spinner" /> {error || 'Loading release controls…'}</div>
  </div>

  const guideProgress = Math.round((completed.length / data.onboarding_steps.length) * 100)
  const operational = data.platform_status.status === 'operational'

  return <div className="release-center">
    <header className="release-hero">
      <div>
        <span className="release-eyebrow"><ShieldCheck size={13} /> Release & reliability</span>
        <h1>Release Center</h1>
        <p>One place to verify platform health, launch controls, recovery exports, and final acceptance.</p>
      </div>
      <button type="button" className="release-button release-button-quiet" onClick={load} aria-label="Refresh release status">
        <RefreshCw size={14} /> Refresh
      </button>
    </header>

    {error && <div className="release-message release-message-error" role="alert">{error}</div>}
    {notice && <div className="release-message release-message-success" role="status">
      {notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={14} /></button>
    </div>}

    <section className={`release-status-banner${operational ? '' : ' release-status-degraded'}`} aria-labelledby="release-platform-title">
      <div>
        <span className="release-card-icon"><Server size={18} /></span>
        <div><small>Live platform</small><h2 id="release-platform-title">{operational ? 'All systems operational' : 'A platform component needs attention'}</h2></div>
      </div>
      <Status value={data.platform_status.status} />
      <div className="release-components">
        {data.platform_status.components.map(component => <div key={component.key}>
          <span className={`release-component-dot${component.status === 'operational' ? '' : ' degraded'}`} />
          <strong>{component.name}</strong><small>{component.status}</small>
        </div>)}
      </div>
      <p>Checked {new Date(data.platform_status.checked_at).toLocaleString()} · version {data.platform_status.version}</p>
    </section>

    <div className="release-primary-grid">
      <section className="release-card" aria-labelledby="release-guide-title">
        <CardTitle id="release-guide-title" icon={CheckCircle2} eyebrow="Operator checklist">Guided release path</CardTitle>
        <p className="release-copy">Record deliberate operator acceptance. Automated checks remain independent.</p>
        <div className="release-progress" role="progressbar" aria-label="Release guide progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={guideProgress}>
          <span style={{ width:`${guideProgress}%` }} />
        </div>
        <div className="release-checklist">
          {data.onboarding_steps.map((step, index) => {
            const done = completed.includes(step)
            return <button type="button" key={step} onClick={() => toggleStep(step)} disabled={busy === `step-${step}`} aria-pressed={done}>
              <span className={done ? 'complete' : ''}>{done ? <Check size={14} /> : <Circle size={14} />}</span>
              <span><small>Step {index + 1}</small><strong>{STEP_DETAILS[step][0]}</strong><em>{STEP_DETAILS[step][1]}</em></span>
            </button>
          })}
        </div>
        <div className="release-next-step">
          {data.onboarding.current_step === 'complete' ? 'Release guide complete.' : `Next: ${STEP_DETAILS[data.onboarding.current_step]?.[0] || data.onboarding.current_step}`}
        </div>
      </section>

      <section className="release-card" aria-labelledby="release-score-title">
        <div className="release-card-heading-row">
          <CardTitle id="release-score-title" icon={Gauge} eyebrow="Release gate">Acceptance score</CardTitle>
          {latestReadiness && <div className="release-score"><strong>{latestReadiness.score}%</strong><Status value={latestReadiness.status} /></div>}
        </div>
        {!latestReadiness && <Empty>No acceptance run yet. Run the checks before shipping.</Empty>}
        <div className="release-check-results">
          {latestReadiness?.checks.map(item => <div key={item.key}>
            <span className={item.passed ? 'passed' : item.critical ? 'failed' : 'warning'}>
              {item.passed ? <Check size={13} /> : item.critical ? <X size={13} /> : <TriangleAlert size={13} />}
            </span>
            <span><strong>{item.name}</strong><small>{item.detail}</small></span>
          </div>)}
        </div>
        <button type="button" className="release-button" disabled={busy === 'readiness'}
          onClick={() => act('readiness', runLaunchReadiness, 'Release acceptance checks completed.')}>
          <ShieldCheck size={14} /> {busy === 'readiness' ? 'Running checks…' : 'Run acceptance checks'}
        </button>
        <p className="release-footnote">Critical platform failures block release. Optional controls produce warnings so the operator can make an informed decision.</p>
      </section>
    </div>

    <section className="release-card release-recovery" aria-labelledby="release-recovery-title">
      <div className="release-card-heading-row">
        <CardTitle id="release-recovery-title" icon={Archive} eyebrow="Disaster recovery">Secret-free recovery snapshots</CardTitle>
        <button type="button" className="release-button" disabled={busy === 'snapshot'}
          onClick={() => act('snapshot', createRecoverySnapshot, 'Recovery snapshot created.')}>
          <Archive size={14} /> {busy === 'snapshot' ? 'Creating…' : 'Create snapshot'}
        </button>
      </div>
      <p className="release-copy">Configuration and ownership references are included. Credentials, API keys, document contents, memory, and run data are always excluded.</p>
      <div className="release-metrics">
        <Metric label="Retention" value={`${data.recovery_policy.retention_days} days`} />
        <Metric label="Verification" value="Dry run only" />
        <Metric label="Secrets" value="Excluded" />
        <Metric label="Maximum export" value="2 MB" />
      </div>
      {!data.recovery_snapshots.length && <Empty>No recovery snapshots yet.</Empty>}
      <div className="release-snapshots">
        {data.recovery_snapshots.map(snapshot => {
          const verification = latestVerifications.get(snapshot.id)
          return <article key={snapshot.id}>
            <div>
              <span className="release-snapshot-title">Snapshot {snapshot.id.slice(0, 8)} <Status value={snapshot.status} /> {verification && <Status value={verification.status} />}</span>
              <code>{snapshot.manifest_sha256.slice(0, 20)}…</code>
              <small>{Object.entries(snapshot.resource_counts || {}).map(([key, count]) => `${key}: ${count}`).join(' · ')}</small>
            </div>
            <div>
              <button type="button" className="release-button release-button-quiet" onClick={async () => {
                const hash = await downloadRecoverySnapshot(snapshot.id)
                setNotice(`Snapshot downloaded. SHA-256: ${hash}`)
              }}><Download size={13} /> Download</button>
              <button type="button" className="release-button release-button-quiet" disabled={busy === `verify-${snapshot.id}`}
                onClick={() => act(`verify-${snapshot.id}`, () => verifyRecoverySnapshot(snapshot.id), 'Recovery dry run passed.')}>
                <RotateCcw size={13} /> Verify dry run
              </button>
            </div>
          </article>
        })}
      </div>
    </section>

    <section className="release-card" aria-labelledby="release-policy-title">
      <CardTitle id="release-policy-title" icon={ShieldCheck} eyebrow="Safety contract">What AgentForge guarantees</CardTitle>
      <div className="release-policy-grid">
        {[
          ['No hidden spending', 'Billing stays in sandbox until a provider is explicitly configured.'],
          ['No secret backups', 'Recovery exports exclude credentials and sensitive runtime content.'],
          ['No destructive restore', 'Verification is dry-run only until an approved recovery event.'],
          ['Fail-closed access', 'Keys, webhooks, SCIM, and organization actions require authorization.'],
          ['Observable execution', 'Runs, approvals, governance, usage, and billing keep durable trails.'],
          ['Recoverable operations', 'Exports are hashed, expiring, downloadable, and verifiable.'],
        ].map(([name, description]) => <article key={name}><strong>{name}</strong><p>{description}</p></article>)}
      </div>
    </section>
  </div>
}

function CardTitle({ icon:Icon, eyebrow, children, id }) {
  return <div className="release-card-title"><span><Icon size={17} /></span><div><small>{eyebrow}</small><h2 id={id}>{children}</h2></div></div>
}
function Status({ value }) {
  const tone = ['operational', 'ready', 'passed'].includes(value) ? 'good' : ['warning', 'expired'].includes(value) ? 'warning' : 'bad'
  return <span className={`release-status release-status-${tone}`}>{value}</span>
}
function Metric({ label, value }) { return <div><small>{label}</small><strong>{value}</strong></div> }
function Empty({ children }) { return <div className="release-empty">{children}</div> }
