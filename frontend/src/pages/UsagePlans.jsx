import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, BarChart3, Check, Coins, Gauge, ShieldAlert, X,
} from 'lucide-react'

import {
  cancelPlanChangeRequest,
  getUsageSummary,
  requestPlanChange,
  updateUsageBudget,
} from '../lib/api'

const panel = {
  background:'#13151C',
  border:'1px solid #252837',
  borderRadius:14,
  padding:18,
}
const field = {
  width:'100%',
  boxSizing:'border-box',
  color:'#F4F4F5',
  background:'#0D0F15',
  border:'1px solid #2B2E3D',
  borderRadius:8,
  padding:'9px 11px',
}
const button = {
  border:0,
  borderRadius:8,
  padding:'9px 13px',
  background:'#7C3AED',
  color:'white',
  cursor:'pointer',
  display:'inline-flex',
  alignItems:'center',
  justifyContent:'center',
  gap:7,
}

function Metric({ label, value, limit, percent, warning, suffix = '' }) {
  const color = warning ? '#F59E0B' : '#7C3AED'
  return (
    <div style={panel}>
      <div style={{ color:'#8B8FA3', fontSize:11, textTransform:'uppercase' }}>{label}</div>
      <div style={{ fontSize:21, margin:'8px 0 9px' }}>
        {value}{suffix} <span style={{ color:'#71717A', fontSize:12 }}>/ {limit}{suffix}</span>
      </div>
      <div style={{ height:8, background:'#0D0F15', borderRadius:10, overflow:'hidden' }}>
        <div style={{ width:`${Math.min(100, percent)}%`, height:'100%', background:color, transition:'width .3s' }} />
      </div>
      <div style={{ color:warning ? '#FBBF24' : '#71717A', fontSize:11, marginTop:7 }}>
        {percent.toFixed(1)}% used
      </div>
    </div>
  )
}

export default function UsagePlans() {
  const [summary, setSummary] = useState(null)
  const [budget, setBudget] = useState({
    monthly_cost_limit_usd:'',
    warning_percent:80,
    hard_limit_enabled:false,
  })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await getUsageSummary()
      setSummary(data)
      setBudget({
        monthly_cost_limit_usd:data.budget.monthly_cost_limit_usd ?? '',
        warning_percent:data.budget.warning_percent,
        hard_limit_enabled:data.budget.hard_limit_enabled,
      })
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    const initial = setTimeout(load, 0)
    const interval = setInterval(load, 10000)
    return () => {
      clearTimeout(initial)
      clearInterval(interval)
    }
  }, [load])

  const act = async (key, action, message) => {
    setBusy(key)
    try {
      await action()
      setNotice(message)
      setError('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const saveBudget = event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const monthlyLimit = fields.get('monthly_cost_limit_usd')
    act('budget', () => updateUsageBudget({
      monthly_cost_limit_usd:monthlyLimit === '' ? null : Number(monthlyLimit),
      warning_percent:Number(fields.get('warning_percent')),
      hard_limit_enabled:fields.get('hard_limit_enabled') === 'on',
    }), 'Budget guardrails saved.')
  }

  if (!summary) {
    return <div style={{ color:'#8B8FA3', padding:30 }}>{error || 'Loading usage ledger…'}</div>
  }

  const { period, limits, percentages, warnings, plan, plans, entitlement } = summary
  const activeRequest = summary.plan_change_requests.find(item => item.status === 'pending')
  const modelCallsLeft = Math.max(0, Number(limits.model_calls) - period.model_calls)

  return (
    <div style={{ maxWidth:1200, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:15, alignItems:'end', marginBottom:20 }}>
        <div>
          <h1 style={{ margin:'0 0 5px', fontSize:25 }}>Usage & plans</h1>
          <p style={{ margin:0, color:'#8B8FA3', fontSize:13 }}>
            Transparent monthly metering, personal budgets, and billing-ready entitlements.
          </p>
        </div>
        <div style={{ ...panel, padding:'9px 13px', color:'#C4B5FD', fontSize:12 }}>
          {period.period_start} → {period.period_end}
        </div>
      </div>

      {error && <div style={{ ...panel, borderColor:'#7F1D1D', color:'#FCA5A5', marginBottom:13 }}>{error}</div>}
      {notice && (
        <div style={{ ...panel, borderColor:'#14532D', color:'#86EFAC', marginBottom:13, display:'flex', justifyContent:'space-between' }}>
          {notice}<button onClick={() => setNotice('')} style={{ background:'none', border:0, color:'#86EFAC' }}><X size={15} /></button>
        </div>
      )}

      {(warnings.model_calls || warnings.tokens || warnings.plan_cost || warnings.personal_cost) && (
        <div style={{ ...panel, borderColor:'#78350F', color:'#FBBF24', marginBottom:13, display:'flex', gap:9 }}>
          <AlertTriangle size={18} />
          Usage crossed your {summary.budget.warning_percent}% warning threshold. Review the limits below before starting a large run.
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:15 }}>
        <Metric label="Model calls" value={period.model_calls} limit={limits.model_calls}
          percent={percentages.model_calls} warning={warnings.model_calls} />
        <Metric label="Tokens" value={Number(period.tokens).toLocaleString()}
          limit={Number(limits.tokens).toLocaleString()} percent={percentages.tokens} warning={warnings.tokens} />
        <Metric label="Estimated cost" value={Number(period.estimated_cost_usd).toFixed(4)}
          limit={Number(limits.estimated_cost_usd).toFixed(2)}
          percent={percentages.plan_cost} warning={warnings.plan_cost} suffix="$" />
        <Metric label="Marketplace installs" value={period.marketplace_installs}
          limit={limits.marketplace_installs}
          percent={limits.marketplace_installs
            ? (period.marketplace_installs / limits.marketplace_installs) * 100 : 0}
          warning={false} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.25fr .75fr', gap:14, marginBottom:18 }}>
        <div style={panel}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start' }}>
            <div>
              <div style={{ color:'#8B8FA3', fontSize:11, textTransform:'uppercase' }}>Current entitlement</div>
              <h2 style={{ margin:'7px 0 4px', fontSize:20 }}>{plan.display_name}</h2>
              <p style={{ color:'#8B8FA3', fontSize:12, marginTop:0 }}>{plan.description}</p>
            </div>
            <span style={{ borderRadius:20, padding:'5px 9px', background:'rgba(34,197,94,.12)', color:'#86EFAC', fontSize:11 }}>
              {entitlement.status} · {entitlement.source}
            </span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, margin:'14px 0' }}>
            {[
              ['Calls remaining', modelCallsLeft],
              ['Agent limit', limits.agents],
              ['Workflow limit', limits.workflows],
            ].map(([label, value]) => (
              <div key={label} style={{ background:'#0D0F15', borderRadius:9, padding:11 }}>
                <div style={{ color:'#71717A', fontSize:10 }}>{label}</div>
                <div style={{ marginTop:5, fontSize:17 }}>{value}</div>
              </div>
            ))}
          </div>
          {(plan.features || []).map(feature => (
            <div key={feature} style={{ color:'#A1A1AA', fontSize:12, marginTop:6 }}>
              <Check size={13} color="#86EFAC" style={{ marginRight:6 }} /> {feature}
            </div>
          ))}
        </div>

        <form onSubmit={saveBudget} style={panel}>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <ShieldAlert size={17} color="#A78BFA" />
            <h2 style={{ margin:0, fontSize:16 }}>Personal cost guardrail</h2>
          </div>
          <label style={{ display:'block', color:'#8B8FA3', fontSize:11, margin:'13px 0 5px' }}>Monthly budget (USD)</label>
          <input name="monthly_cost_limit_usd" style={field} type="number" min="0.01" step="0.01" placeholder="Optional"
            value={budget.monthly_cost_limit_usd}
            onChange={event => setBudget(current => ({ ...current, monthly_cost_limit_usd:event.target.value }))} />
          <label style={{ display:'block', color:'#8B8FA3', fontSize:11, margin:'10px 0 5px' }}>Warn at percent</label>
          <input name="warning_percent" style={field} type="number" min="1" max="100" value={budget.warning_percent}
            onChange={event => setBudget(current => ({ ...current, warning_percent:event.target.value }))} />
          <label style={{ display:'flex', gap:8, color:'#C4B5FD', fontSize:12, margin:'11px 0' }}>
            <input name="hard_limit_enabled" type="checkbox" checked={budget.hard_limit_enabled}
              onChange={event => setBudget(current => ({ ...current, hard_limit_enabled:event.target.checked }))} />
            Block model calls at this budget
          </label>
          <button style={button} disabled={busy === 'budget'}>
            <Gauge size={14} /> Save guardrail
          </button>
          <p style={{ color:'#71717A', fontSize:10, lineHeight:1.5 }}>
            Cost is estimated from aggregate tokens and configurable model rates. No purchase is made here.
          </p>
        </form>
      </div>

      <h2 style={{ fontSize:17 }}>Available plans</h2>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {plans.map(item => {
          const current = item.plan_key === entitlement.plan_key
          const pending = activeRequest?.requested_plan_key === item.plan_key
          return (
            <div key={item.plan_key} style={{ ...panel, borderColor:current ? '#7C3AED' : '#252837' }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <h3 style={{ margin:0 }}>{item.display_name}</h3>
                <Coins size={17} color={current ? '#A78BFA' : '#71717A'} />
              </div>
              <p style={{ color:'#8B8FA3', fontSize:12, minHeight:55 }}>{item.description}</p>
              <div style={{ color:'#D4D4D8', fontSize:12, marginBottom:10 }}>
                {item.limits.model_calls.toLocaleString()} model calls · {item.limits.tokens.toLocaleString()} tokens
              </div>
              {current ? (
                <span style={{ color:'#86EFAC', fontSize:12 }}><Check size={13} /> Current plan</span>
              ) : pending ? (
                <button style={{ ...button, background:'#27272A' }}
                  onClick={() => act('cancel-plan', () => cancelPlanChangeRequest(activeRequest.id), 'Plan request cancelled.')}>
                  Cancel pending request
                </button>
              ) : (
                <button style={{ ...button, background:'#27272A' }} disabled={Boolean(activeRequest)}
                  onClick={() => act(`plan-${item.plan_key}`, () => requestPlanChange(item.plan_key), `${item.display_name} request submitted for review.`)}>
                  Request {item.display_name}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div style={panel}>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
          <BarChart3 size={17} color="#A78BFA" />
          <h2 style={{ fontSize:16, margin:0 }}>Immutable usage ledger</h2>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1.3fr .8fr .6fr .6fr .7fr', color:'#71717A', fontSize:10, padding:'0 8px 7px' }}>
          <span>RESOURCE</span><span>TIME</span><span>CALLS</span><span>TOKENS</span><span>COST</span>
        </div>
        {summary.events.map(event => (
          <div key={event.id} style={{ display:'grid', gridTemplateColumns:'1.3fr .8fr .6fr .6fr .7fr', padding:8, borderTop:'1px solid #252837', fontSize:12 }}>
            <span style={{ textTransform:'capitalize' }}>{event.resource_type.replace('_', ' ')}</span>
            <span style={{ color:'#8B8FA3' }}>{new Date(event.occurred_at).toLocaleString()}</span>
            <span>{event.model_calls}</span>
            <span>{event.tokens.toLocaleString()}</span>
            <span>${Number(event.estimated_cost_usd).toFixed(6)}</span>
          </div>
        ))}
        {!summary.events.length && <p style={{ color:'#71717A', fontSize:12 }}>No metered activity this period.</p>}
      </div>
    </div>
  )
}
