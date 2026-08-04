import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, CheckCircle2, Clock3, Headphones, KeyRound,
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

export default function FlagshipStarterKits({ onInstalled }) {
  const navigate = useNavigate()
  const [kits, setKits] = useState([])
  const [connections, setConnections] = useState([])
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ connections:{}, settings:{ ...DEFAULTS } })
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
    setForm({ connections:selectedConnections, settings:{ ...DEFAULTS } })
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

  return (
    <section className="starter-kits" aria-labelledby="starter-kits-title">
      <div className="starter-kits-heading">
        <div>
          <span><Sparkles size={13} /> Flagship starter kits</span>
          <h2 id="starter-kits-title">Install a complete workflow, not an empty canvas.</h2>
          <p>Each kit creates a focused AI agent, publishes a version, adds human approval, connects a real delivery tool, and includes a test input.</p>
        </div>
        <div className="starter-kits-trust"><ShieldCheck size={16} /> Consequential actions wait for approval</div>
      </div>

      {error && !selected && <div className="starter-kits-error">{error}</div>}
      <div className="starter-kits-grid">
        {kits.map(kit => {
          const Icon = ICONS[kit.slug] || Sparkles
          const ready = kit.requirements.every(item => availableByProvider.get(item.provider)?.length)
          return (
            <article className="starter-kit-card" key={kit.slug}>
              <div className="starter-kit-card-top">
                <span className="starter-kit-icon"><Icon size={20} /></span>
                <span className={`starter-kit-status${ready ? ' starter-kit-status-ready' : ''}`}>
                  {ready ? <><CheckCircle2 size={12} /> Connections ready</> : <><KeyRound size={12} /> Connection needed</>}
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
                <p>The agent is published, the approval gate is enabled, and the selected connections are attached.</p>
                <label>Use this test input</label>
                <pre>{installed.sample_input}</pre>
                <button type="button" onClick={() => navigate(installed.next_path)}>Open workflow and run it <ArrowRight size={15} /></button>
              </div>
            ) : <>
              <div className="starter-kit-form-section">
                <h3>1. Choose secure connections</h3>
                {selected.requirements.map(requirement => {
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

              <div className="starter-kit-form-section">
                <h3>2. Set delivery details</h3>
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
              </div>

              <div className="starter-kit-form-section starter-kit-review">
                <h3>3. Review safety contract</h3>
                <p><ShieldCheck size={15} /> External delivery cannot run until a person approves the generated content.</p>
                <p><CheckCircle2 size={15} /> The installed agent and workflow remain editable, versioned, observable, and pausable.</p>
              </div>
              {error && <div className="starter-kits-error">{error}</div>}
              <div className="starter-kit-modal-actions">
                <button type="button" onClick={() => setSelected(null)}>Cancel</button>
                <button className="starter-kit-install" disabled={busy || selected.requirements.some(item => !form.connections[item.key])}>
                  {busy ? 'Installing safely…' : 'Install active workflow'}
                </button>
              </div>
            </>}
          </form>
        </div>
      )}
    </section>
  )
}
