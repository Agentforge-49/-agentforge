import { useCallback, useEffect, useState } from 'react'
import {
  Check, CircleDollarSign, CreditCard, FileText, FlaskConical,
  History, RefreshCw, ShieldCheck, X,
} from 'lucide-react'

import {
  cancelBillingCheckout,
  cancelBillingSubscription,
  completeBillingCheckout,
  createBillingCheckout,
  getBillingSummary,
  resumeBillingSubscription,
  updateBillingCustomer,
} from '../lib/api'

const panel = {
  background:'#13151C', border:'1px solid #252837', borderRadius:14, padding:18,
}
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

export default function Billing() {
  const [summary, setSummary] = useState(null)
  const [customer, setCustomer] = useState({
    billing_email:'', company_name:'', tax_country:'',
  })
  const [checkout, setCheckout] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await getBillingSummary()
      setSummary(data)
      setCustomer({
        billing_email:data.customer?.billing_email || '',
        company_name:data.customer?.company_name || '',
        tax_country:data.customer?.tax_country || '',
      })
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
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

  const saveCustomer = event => {
    event.preventDefault()
    act('customer', () => updateBillingCustomer(customer), 'Billing profile saved.')
  }

  const startCheckout = async (planKey, interval) => {
    const result = await act('checkout', () => createBillingCheckout({
      plan_key:planKey,
      billing_interval:interval,
    }), 'Sandbox checkout created. No charge was made.')
    if (result) setCheckout(result)
  }

  const completeCheckout = async () => {
    if (!checkout) return
    const result = await act('complete', () => completeBillingCheckout(
      checkout.checkout.id, checkout.token,
    ), 'Sandbox lifecycle completed. Your real entitlement was not changed.')
    if (result) setCheckout(null)
  }

  if (!summary) {
    return <div style={{ color:'#8B8FA3', padding:30 }}>{error || 'Loading billing ledger…'}</div>
  }

  const current = summary.current_subscription

  return (
    <div style={{ maxWidth:1200, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'end', gap:15, marginBottom:20 }}>
        <div>
          <h1 style={{ margin:'0 0 5px', fontSize:25 }}>Billing & subscriptions</h1>
          <p style={{ margin:0, color:'#8B8FA3', fontSize:13 }}>
            Provider-neutral checkout contracts, subscription lifecycle, invoices, idempotent webhooks, and an immutable ledger.
          </p>
        </div>
        <button style={quietButton} onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <Message color="#FCA5A5" border="#7F1D1D">{error}</Message>}
      {notice && <Message color="#86EFAC" border="#14532D">
        {notice}<button onClick={() => setNotice('')} style={{ border:0, background:'none', color:'#86EFAC' }}><X size={14} /></button>
      </Message>}

      <div style={{ ...panel, borderColor:'#6D28D9', marginBottom:14, display:'flex', gap:12 }}>
        <FlaskConical size={22} color="#C4B5FD" />
        <div>
          <strong style={{ color:'#D8B4FE' }}>Billing sandbox is active</strong>
          <div style={{ color:'#A1A1AA', fontSize:12, marginTop:4, lineHeight:1.5 }}>
            Checkout and invoice lifecycles are fully recorded, but no money is charged and no paid
            entitlement is granted. Live provider webhooks stay disabled until a provider and secret are explicitly configured.
          </div>
        </div>
      </div>

      {checkout && (
        <div style={{ ...panel, borderColor:'#14532D', marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
            <div>
              <strong>Sandbox checkout ready</strong>
              <div style={{ color:'#8B8FA3', fontSize:11, marginTop:5 }}>
                {checkout.checkout.plan_key} · {checkout.checkout.billing_interval} ·
                expires {new Date(checkout.checkout.expires_at).toLocaleTimeString()}
              </div>
            </div>
            <div style={{ display:'flex', gap:7 }}>
              <button style={button} onClick={completeCheckout} disabled={busy === 'complete'}>
                <Check size={14} /> Simulate completion
              </button>
              <button style={quietButton} onClick={async () => {
                await act('cancel-checkout', () => cancelBillingCheckout(checkout.checkout.id), 'Checkout cancelled.')
                setCheckout(null)
              }}>Cancel</button>
            </div>
          </div>
          <div style={{ color:'#71717A', fontSize:10, marginTop:9 }}>
            The one-time token remains only in this browser state and is stored as a SHA-256 hash.
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1.2fr .8fr', gap:14, marginBottom:14 }}>
        <div style={panel}>
          <Title icon={ShieldCheck}>Current entitlement</Title>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start' }}>
            <div>
              <div style={{ fontSize:22, textTransform:'capitalize' }}>
                {summary.entitlement?.plan_key || 'free'}
              </div>
              <div style={{ color:'#8B8FA3', fontSize:11, marginTop:4 }}>
                {summary.entitlement?.status} · source {summary.entitlement?.source}
              </div>
            </div>
            <span style={badge('#14532D', '#86EFAC')}>Real access</span>
          </div>
          <p style={{ color:'#71717A', fontSize:11, lineHeight:1.55 }}>
            Sandbox subscriptions are kept separate from this entitlement. Completing a test
            checkout cannot increase production model limits.
          </p>
        </div>

        <div style={panel}>
          <Title icon={CreditCard}>Sandbox subscription</Title>
          {current ? (
            <>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:18, textTransform:'capitalize' }}>{current.plan_key}</div>
                  <div style={{ color:'#8B8FA3', fontSize:11 }}>
                    {current.status} · {current.billing_interval}
                  </div>
                </div>
                <span style={badge('#3F2A0B', '#FBBF24')}>Test only</span>
              </div>
              <div style={{ display:'flex', gap:7, marginTop:12 }}>
                {current.cancel_at_period_end ? (
                  <button style={button} onClick={() => act('resume', resumeBillingSubscription,
                    'Scheduled cancellation reversed.')}>Resume</button>
                ) : (
                  <button style={quietButton} onClick={() => act('cancel-sub',
                    () => cancelBillingSubscription(false), 'Cancellation scheduled.')}>
                    Cancel at period end
                  </button>
                )}
                <button style={{ ...quietButton, color:'#FCA5A5' }}
                  onClick={() => act('cancel-now', () => cancelBillingSubscription(true),
                    'Sandbox subscription cancelled.')}>Cancel now</button>
              </div>
            </>
          ) : <Empty>No sandbox subscription.</Empty>}
        </div>
      </div>

      <h2 style={{ fontSize:17 }}>Plan checkout contracts</h2>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:14 }}>
        {summary.plans.map(plan => (
          <div key={plan.plan_key} style={{ ...panel,
            borderColor:plan.plan_key === summary.entitlement?.plan_key ? '#6D28D9' : '#252837' }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
              <h3 style={{ margin:0 }}>{plan.display_name}</h3>
              <CircleDollarSign size={18} color="#A78BFA" />
            </div>
            <p style={{ color:'#8B8FA3', fontSize:11, minHeight:50, lineHeight:1.5 }}>{plan.description}</p>
            <div style={{ fontSize:15, marginBottom:10 }}>
              {plan.monthly_price_cents === null
                ? 'Price not configured'
                : plan.monthly_price_cents === 0
                  ? 'Free'
                  : `${money(plan.monthly_price_cents, plan.currency)}/month`}
            </div>
            {(plan.features || []).slice(0, 4).map(feature => (
              <div key={feature} style={{ color:'#A1A1AA', fontSize:10, marginTop:5 }}>
                <Check size={11} color="#86EFAC" /> {feature}
              </div>
            ))}
            {plan.plan_key !== 'free' && (
              <div style={{ display:'flex', gap:6, marginTop:13 }}>
                <button style={button} disabled={busy === 'checkout'}
                  onClick={() => startCheckout(plan.plan_key, 'monthly')}>Test monthly</button>
                <button style={quietButton} disabled={busy === 'checkout'}
                  onClick={() => startCheckout(plan.plan_key, 'annual')}>Test annual</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={saveCustomer} style={{ ...panel, marginBottom:14 }}>
        <Title icon={CreditCard}>Billing profile</Title>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 2fr 120px auto', gap:9, alignItems:'end' }}>
          <Field label="Billing email">
            <input style={field} type="email" required value={customer.billing_email}
              onChange={event => setCustomer({ ...customer, billing_email:event.target.value })} />
          </Field>
          <Field label="Company name">
            <input style={field} value={customer.company_name}
              onChange={event => setCustomer({ ...customer, company_name:event.target.value })} />
          </Field>
          <Field label="Country code">
            <input style={field} maxLength="2" placeholder="US" value={customer.tax_country}
              onChange={event => setCustomer({ ...customer, tax_country:event.target.value.toUpperCase() })} />
          </Field>
          <button style={button} disabled={busy === 'customer'}>Save profile</button>
        </div>
      </form>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div style={panel}>
          <Title icon={FileText}>Invoices</Title>
          {!summary.invoices.length && <Empty>No invoices yet.</Empty>}
          {summary.invoices.slice(0, 12).map(invoice => (
            <div key={invoice.id} style={row}>
              <div>
                <div style={{ fontSize:12 }}>{invoice.invoice_number}</div>
                <div style={{ color:'#71717A', fontSize:10 }}>
                  {new Date(invoice.created_at).toLocaleDateString()} · {invoice.status}
                </div>
              </div>
              <div style={{ textAlign:'right', fontSize:12 }}>
                {money(invoice.total_cents, invoice.currency)}
                <div style={{ color:'#FBBF24', fontSize:9 }}>{invoice.mode}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={panel}>
          <Title icon={History}>Immutable billing ledger</Title>
          {!summary.ledger.length && <Empty>No billing events yet.</Empty>}
          {summary.ledger.slice(0, 16).map(event => (
            <div key={event.id} style={row}>
              <div>
                <div style={{ fontSize:11 }}>{event.event_type}</div>
                <div style={{ color:'#71717A', fontSize:9 }}>
                  sequence {event.sequence_number} · {new Date(event.occurred_at).toLocaleString()}
                </div>
              </div>
              <code style={{ color:'#A78BFA', fontSize:9 }}>{event.event_hash.slice(0, 12)}…</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Title({ icon:Icon, children }) {
  return <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:11 }}>
    <Icon size={17} color="#A78BFA" /><h2 style={{ fontSize:16, margin:0 }}>{children}</h2>
  </div>
}
function Field({ label, children }) {
  return <label><span style={{ display:'block', color:'#8B8FA3', fontSize:10, marginBottom:5 }}>{label}</span>{children}</label>
}
function Empty({ children }) {
  return <div style={{ color:'#71717A', fontSize:11, padding:'8px 0' }}>{children}</div>
}
function Message({ color, border, children }) {
  return <div style={{ ...panel, color, borderColor:border, marginBottom:13,
    display:'flex', justifyContent:'space-between' }}>{children}</div>
}
function money(cents, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style:'currency', currency }).format(Number(cents || 0) / 100)
}
function badge(background, color) {
  return { background, color, padding:'5px 8px', borderRadius:20, fontSize:10 }
}
const row = {
  display:'flex', alignItems:'center', justifyContent:'space-between', gap:10,
  borderBottom:'1px solid #20232F', padding:'10px 0',
}
