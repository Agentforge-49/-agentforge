import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Check, CheckCircle2, KeyRound, Link2, LoaderCircle,
  Search, ShieldCheck, Sparkles, TestTube2, Workflow,
} from 'lucide-react'

import AppDirectory from '../components/AppDirectory'
import AppLogo from '../components/AppLogo.jsx'
import { getCredentials, getOauthConnections } from '../lib/api.js'
import { appConnectionPath, isAppConnected } from '../lib/app-connections.js'
import { INTEGRATION_CATALOG } from '../lib/integration-catalog.js'
import { useNavigate } from '../lib/router.jsx'

const GOALS = {
  support:{ label:'Customer support', description:'Receive requests, ground the reply, and deliver after review.', apps:['gmail','zendesk','slack'] },
  sales:{ label:'Sales operations', description:'Capture leads, enrich the facts, and record approved follow-up.', apps:['hubspot','google_sheets','gmail'] },
  internal:{ label:'Internal operations', description:'Route requests, coordinate owners, and keep completion visible.', apps:['microsoft_teams','asana','google_calendar'] },
  custom:{ label:'Something else', description:'Choose any app, verify access, then insert one tested action.', apps:['notion','airtable','slack'] },
}

export default function AppsHub() {
  const navigate = useNavigate()
  const [goal, setGoal] = useState('support')
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true
    Promise.allSettled([getCredentials(), getOauthConnections()]).then(([vault, oauth]) => {
      if (!active) return
      const items = [
        ...(vault.status === 'fulfilled' ? vault.value || [] : []),
        ...(oauth.status === 'fulfilled' ? (oauth.value || []).filter(item => item.status === 'active') : []),
      ]
      setConnections(items)
      if (vault.status === 'rejected' && oauth.status === 'rejected') setLoadError('Connection status is temporarily unavailable. The catalog still works.')
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const connectedProviders = useMemo(() => new Set(connections.flatMap(item => [item.provider, item.app_slug].filter(Boolean))), [connections])
  const recommendations = GOALS[goal].apps.map(slug => INTEGRATION_CATALOG.find(app => app.slug === slug)).filter(Boolean)
  const readyCount = recommendations.filter(app => isAppConnected(app, connectedProviders)).length
  const connect = app => navigate(appConnectionPath(app))

  return (
    <div className="apps-hub-page">
      <header className="apps-hub-hero">
        <div>
          <span><Sparkles size={13} /> Connection Center</span>
          <h1>Connect an outcome—not a wall of app logos.</h1>
          <p>Choose the work you want to improve. AgentForge recommends the smallest useful app set, guides authentication, tests access, and shows where each connection can be used.</p>
          <div className="apps-hub-trust"><ShieldCheck size={14} /> Secrets stay encrypted and outside prompts.</div>
        </div>
        <div className="apps-hub-readiness">
          <div><strong>{loading ? '—' : connections.length}</strong><span>active connection{connections.length === 1 ? '' : 's'}</span></div>
          <p>{loading ? <><LoaderCircle size={13} className="spin" /> Checking workspace readiness…</> : connections.length ? 'Your connected apps can be inserted into tested workflows.' : 'Start with one destination app. You can add the rest later.'}</p>
          <button type="button" onClick={() => navigate('/credentials')}>Manage connections <ArrowRight size={13} /></button>
        </div>
      </header>

      {loadError && <div className="apps-hub-error" role="status">{loadError}</div>}

      <section className="apps-journey" aria-labelledby="apps-journey-title">
        <div className="apps-journey-heading">
          <div><span>Guided setup</span><h2 id="apps-journey-title">What are you trying to make happen?</h2><p>Pick one outcome. We will keep the connection plan small and understandable.</p></div>
          <ol aria-label="Connection setup steps">
            <li className="active"><span>1</span> Choose</li><li><span>2</span> Connect</li><li><span>3</span> Test</li><li><span>4</span> Use</li>
          </ol>
        </div>

        <div className="apps-goal-switch" role="tablist" aria-label="Connection goals">
          {Object.entries(GOALS).map(([key, item]) => <button type="button" role="tab" aria-selected={goal === key} className={goal === key ? 'active' : ''} key={key} onClick={() => setGoal(key)}>{item.label}</button>)}
        </div>

        <div className="apps-plan">
          <div className="apps-plan-copy"><small>Recommended connection plan</small><h3>{GOALS[goal].label}</h3><p>{GOALS[goal].description}</p><div><CheckCircle2 size={15} /><span><strong>{readyCount}/{recommendations.length} ready</strong> for this starter path</span></div></div>
          <div className="apps-plan-cards">{recommendations.map((app, index) => {
            const connected = isAppConnected(app, connectedProviders)
            return <article key={app.slug}>
              <div><span>{index + 1}</span><AppLogo slug={app.slug} name={app.name} size={42} /></div>
              <small>{index === 0 ? 'Receive work' : index === recommendations.length - 1 ? 'Deliver result' : 'Add context'}</small>
              <h4>{app.name}</h4>
              <p>{connected ? 'Connected. Test or manage this account before production use.' : 'Follow the guided setup, then verify access with a real connection test.'}</p>
              <button type="button" className={connected ? 'connected' : ''} onClick={() => connect(app)}>{connected ? <><Check size={13} /> Manage</> : <>Connect <ArrowRight size={13} /></>}</button>
            </article>
          })}</div>
        </div>
      </section>

      <section className="apps-how">
        {[
          [Link2,'Authorize safely','Use guided OAuth when available or store a scoped API credential in the encrypted vault.'],
          [TestTube2,'Prove the connection','A test explains whether authentication, permissions, or provider configuration failed.'],
          [Workflow,'Insert one action','Open Build and add the tested app only where the workflow actually needs it.'],
        ].map(([Icon,title,text]) => <article key={title}><span><Icon size={17} /></span><div><strong>{title}</strong><p>{text}</p></div></article>)}
      </section>

      <section className="apps-catalog-heading"><div><span><Search size={13} /> Complete catalog</span><h2>Browse all 100 real connection paths.</h2><p>Native actions are typed. Universal apps use authenticated HTTP or signed webhooks and are labeled honestly.</p></div><div><KeyRound size={15} /> {connections.length || 'No'} connected</div></section>
      <AppDirectory workspace connectedProviders={connectedProviders} />
    </div>
  )
}
