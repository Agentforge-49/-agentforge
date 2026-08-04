import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, GitBranch, History, Link2, Plus, Sparkles, Trash2 } from 'lucide-react'

import { deleteChain, getChains } from '../lib/api'
import { useNavigate } from '../lib/router.jsx'

const CAPABILITIES = [
  { icon:Link2, title:'Sequential handoffs', text:'Pass one agent’s output directly into the next specialist.' },
  { icon:GitBranch, title:'Conditional routing', text:'Send work down a different path when keywords or rules match.' },
  { icon:History, title:'Complete run history', text:'Inspect every step, response, duration, and failure from one timeline.' },
]

export default function Chains() {
  const navigate = useNavigate()
  const [chains, setChains] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setChains(await getChains())
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load chains')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const handleDelete = async (id, event) => {
    event.stopPropagation()
    if (!window.confirm('Delete this chain? This cannot be undone.')) return
    try {
      await deleteChain(id)
      setChains(items => items.filter(chain => chain.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return (
    <div className="workspace-loading">
      <div className="workspace-loading-card"><span className="workspace-spinner" /> Loading agent chains…</div>
    </div>
  )

  return (
    <div className="chains-page">
      <header className="chains-header">
        <div>
          <div className="chains-eyebrow"><Sparkles size={13} /> Multi-step intelligence</div>
          <h1>Agent chains</h1>
          <p>Turn individual agents into a coordinated production line with traceable handoffs.</p>
        </div>
        <button className="dashboard-primary" onClick={() => navigate('/chains/new')}><Plus size={16} /> Create chain</button>
      </header>

      {error && (
        <div className="chains-error">
          <span>{error}</span><button onClick={load}>Try again</button>
        </div>
      )}

      <section className="chains-capabilities" aria-label="Chain capabilities">
        {CAPABILITIES.map(({ icon:Icon, title, text }) => (
          <article key={title}><span><Icon size={17} /></span><div><strong>{title}</strong><p>{text}</p></div></article>
        ))}
      </section>

      <div className="chains-section-heading">
        <div><span>Your systems</span><h2>{chains.length ? `${chains.length} saved chain${chains.length === 1 ? '' : 's'}` : 'Build your first chain'}</h2></div>
      </div>

      {chains.length === 0 && !error ? (
        <section className="chains-empty">
          <div className="chains-empty-flow">
            <span>Research agent</span><ArrowRight size={15} /><span>Review agent</span><ArrowRight size={15} /><span>Action agent</span>
          </div>
          <h3>Connect specialists into one dependable system</h3>
          <p>Choose at least two published agents, set their order, and AgentForge will carry the context through every handoff.</p>
          <button className="dashboard-primary" onClick={() => navigate('/chains/new')}>Create your first chain <ArrowRight size={15} /></button>
        </section>
      ) : (
        <section className="chains-grid">
          {chains.map(chain => (
            <article key={chain.id} className="chain-card" onClick={() => navigate(`/chains/${chain.id}/run`)}>
              <div className="chain-card-top">
                <span className="chain-card-icon"><Link2 size={17} /></span>
                <button aria-label={`Delete ${chain.name}`} onClick={event => handleDelete(chain.id, event)}><Trash2 size={14} /></button>
              </div>
              <h3>{chain.name}</h3>
              <p>{chain.description || 'A coordinated sequence of AI agents.'}</p>
              <div className="chain-flow">
                {(chain.agent_names || []).map((name, index) => (
                  <span key={`${name}-${index}`} className="chain-flow-step">
                    <span>{name}</span>
                    {index < chain.agent_names.length - 1 && <ArrowRight size={12} />}
                  </span>
                ))}
              </div>
              <div className="chain-card-footer"><span>{(chain.agent_names || []).length} agents</span><strong>Open chain <ArrowRight size={13} /></strong></div>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
