import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, CheckCircle2, Clock3, Eye, Headphones, KeyRound, Lock,
  MailCheck, Search, ShieldCheck, Sparkles, X,
} from 'lucide-react'

import {
  getCredentials,
  getOauthConnections,
  getStarterKits,
  installStarterKit,
} from '../lib/api'
import { useNavigate } from '../lib/router.jsx'

const ICONS = {
  'support-triage-slack':Headphones,
  'lead-qualification-sheets':MailCheck,
  'research-report-delivery':Search,
}
const DEFAULTS = {
  sheet_range:'Leads!A:A',
  drive_file_name:'agentforge-research-report.txt',
}

export default function FlagshipStarterKits({
  onInstalled,
  onlySlug = '',
  heading = 'Install a complete workflow, not an empty canvas.',
  description = 'Each kit creates a focused AI agent, publishes a version, adds human approval, connects a real delivery tool, and includes a test input.',
}) {
  const navigate = useNavigate()
  const [kits, setKits] = useState([])
  const [connections, setConnections] = useState([])
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ autonomy_mode:'approval', connections:{}, settings:{ ...DEFAULTS } })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [installed, setInstalled] = useState(null)

  useEffect(() => {
    Promise.all([getStarterKits(), getCredentials(), getOauthConnections()])
      .then(([catalog, vault, oauth]) => {
        setKits(catalog.kits || [])
        setConnections([
          ...(vault || []).map(item => ({ ...item, source:'vault' })),
          ...(oauth || []).filter(item => item.status === 'active').map(item => ({
            ...item,
            name:item.provider_account_name || `${item.provider} account`,
            source:'oauth',
          })),
        ])
      })
      .catch(err => setError(err.message))
  }, [])

  const availableByProvider = useMemo(() => {
    const result = new Map()
    for (const connection of connections) {
      const items = result.get(connection.provider) || []
      items.push(connection)
      result.set(connection.provider, items)
    }
    return result
  }, [connections])

  const begin = kit => {
    const selectedConnections = {}
    for (const requirement of kit.requirements) {
      const first = availableByProvider.get(requirement.provider)?.[0]
      if (first) selectedConnections[requirement.key] = first.id
    }
    setForm({ autonomy_mode:'approval', connections:selectedConnections, settings:{ ...DEFAULTS } })
    setInstalled(null)
    setError('')
    setSelected(kit)
  }

  const install = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await installStarterKit(selected.slug, form)
      setInstalled(result)
      onInstalled?.(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const visibleKits = onlySlug ? kits.filter(kit => kit.slug === onlySlug) : kits
  const observesOnly = selected?.slug === 'support-triage-slack' && form.autonomy_mode === 'observe'

  return (
    <section className="starter-kits" aria-labelledby="starter-kits-title">
      <div className="starter-kits-heading">
        <div>
          <span><Sparkles size={13} /> Flagship starter kits</span>
          <h2 id="starter-kits-title">{heading}</h2>
          <p>{description}</p>
        </div>
        <div className="starter-kits-trust"><ShieldCheck size={16} /> Consequential actions wait for approval</div>
      </div>

      {error && !selected && <div className="starter-kits-error">{error}</div>}
      <div className="starter-kits-grid">
        {visibleKits.map(kit => {
          const Icon = ICONS[kit.slug] || Sparkles
          const ready = kit.requirements.every(item => availableByProvider.get(item.provider)?.length)
          const observeAvailable = kit.autonomy_modes?.some(mode => mode.key === 'observe')
          return (
            <article className="starter-kit-card" key={kit.slug}>
              <div className="starter-kit-card-top">
                <span className="starter-kit-icon"><Icon size={20} /></span>
                <span className={`starter-kit-status${ready ? ' starter-kit-status-ready' : ''}`}>
                  {ready
                    ? <><CheckCircle2 size={12} /> Connections ready</>
                    : observeAvailable
                      ? <><Eye size={12} /> Observe ready</>
                      : <><KeyRound size={12} /> Connection needed</>}
                </span>
              </div>
              <small>{kit.audience}</small>
              <h3>{kit.name}</h3>
              <p>{kit.outcome}</p>
              <div className="starter-kit-capabilities">
                {kit.capabilities.map(item => <span key={item}>{item}</span>)}
              </div>
              <div className="starter-kit-footer">
                <span><Clock3 size={13} /> About {kit.estimated_setup_minutes} minutes</span>
                <button type="button" onClick={() => begin(kit)}>Configure kit <ArrowRight size={14} /></button>
              </div>
            </article>
          )
        })}
      </div>

      {selected && (
        <div className="starter-kit-modal-backdrop">
          <form className="starter-kit-modal" onSubmit={install}>
            <div className="starter-kit-modal-head">
              <div><span>Guided installation</span><h2>{selected.name}</h2><p>{selected.description}</p></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close starter-kit setup"><X size={19} /></button>
            </div>

            {installed ? (
              <div className="starter-kit-installed">
                <CheckCircle2 size={34} />
                <h3>Your active workflow is ready.</h3>
                <p>{installed.autonomy_mode === 'observe'
                  ? 'The agent and quality gate are ready in observe-only mode. No external action can run.'
                  : 'The agent is published, the approval gate is enabled, and the selected connections are attached.'}</p>
                <label>Use this test input</label>
                <pre>{installed.sample_input}</pre>
                <div className="starter-kit-installed-actions">
                  <button type="button" onClick={() => navigate(installed.next_path)}>Open workflow and run it <ArrowRight size={15} /></button>
                  {installed.quality && <button className="secondary" type="button" onClick={() => navigate(installed.quality.next_path)}>Review {installed.quality.case_count} quality checks</button>}
                </div>
              </div>
            ) : <>
              {selected.autonomy_modes?.length > 0 && (
                <div className="starter-kit-form-section">
                  <h3>1. Choose the starting autonomy</h3>
                  <div className="starter-kit-autonomy-grid">
                    {selected.autonomy_modes.map(mode => (
                      <button key={mode.key} type="button"
                        className={form.autonomy_mode === mode.key ? 'selected' : ''}
                        onClick={() => setForm(current => ({ ...current, autonomy_mode:mode.key }))}>
                        {mode.key === 'observe' ? <Eye size={16} /> : <ShieldCheck size={16} />}
                        <span><strong>{mode.label}</strong><small>{mode.description}</small></span>
                        {form.autonomy_mode === mode.key && <CheckCircle2 size={15} />}
                      </button>
                    ))}
                    <div className="starter-kit-autonomy-locked">
                      <Lock size={16} /><span><strong>Autonomous</strong><small>Unlock only after quality evidence and safe production runs.</small></span>
                    </div>
                  </div>
                </div>
              )}
              <div className="starter-kit-form-section">
                <h3>{selected.autonomy_modes ? '2' : '1'}. Choose secure connections</h3>
                {observesOnly && <div className="starter-kit-observe-note"><Eye size={16} /><span>Observe mode does not require Slack. Add a connection later when you move to approval-required delivery.</span></div>}
                {!observesOnly && selected.requirements.map(requirement => {
                  const options = availableByProvider.get(requirement.provider) || []
                  return (
                    <div className="starter-kit-field" key={requirement.key}>
                      <label>{requirement.label}</label>
                      {options.length ? (
                        <select required value={form.connections[requirement.key] || ''}
                          onChange={event => setForm(current => ({
                            ...current,
                            connections:{ ...current.connections, [requirement.key]:event.target.value },
                          }))}>
                          <option value="">Select connection</option>
                          {options.map(option => <option key={option.id} value={option.id}>{option.name} ({option.source})</option>)}
                        </select>
                      ) : (
                        <button className="starter-kit-connect" type="button" onClick={() => navigate('/credentials')}>
                          <KeyRound size={14} /> Add {requirement.provider} connection
                        </button>
                      )}
                      <small>{requirement.help}</small>
                    </div>
                  )
                })}
              </div>

              {!observesOnly && <div className="starter-kit-form-section">
                <h3>{selected.autonomy_modes ? '3' : '2'}. Set delivery details</h3>
                {selected.fields.map(field => (
                  <div className="starter-kit-field" key={field.key}>
                    <label>{field.label}</label>
                    <input required value={form.settings[field.key] || ''} placeholder={field.placeholder || ''}
                      onChange={event => setForm(current => ({
                        ...current,
                        settings:{ ...current.settings, [field.key]:event.target.value },
                      }))} />
                    {field.help && <small>{field.help}</small>}
                  </div>
                ))}
              </div>}

              <div className="starter-kit-form-section starter-kit-review">
                <h3>{selected.autonomy_modes ? (observesOnly ? '3' : '4') : '3'}. Review safety contract</h3>
                <p>{observesOnly ? <Eye size={15} /> : <ShieldCheck size={15} />} {observesOnly
                  ? 'The workflow produces a recommendation only and contains no external action.'
                  : 'External delivery cannot run until a person approves the generated content.'}</p>
                <p><CheckCircle2 size={15} /> The installed agent and workflow remain editable, versioned, observable, and pausable.</p>
                {selected.quality_case_count > 0 && <p><CheckCircle2 size={15} /> A quality release gate with {selected.quality_case_count} launch cases is created automatically.</p>}
              </div>
              {error && <div className="starter-kits-error">{error}</div>}
              <div className="starter-kit-modal-actions">
                <button type="button" onClick={() => setSelected(null)}>Cancel</button>
                <button className="starter-kit-install" disabled={busy || (!observesOnly && selected.requirements.some(item => !form.connections[item.key]))}>
                  {busy ? 'Installing safely…' : observesOnly ? 'Install in observe mode' : 'Install approval-gated workflow'}
                </button>
              </div>
            </>}
          </form>
        </div>
      )}
    </section>
  )
}
