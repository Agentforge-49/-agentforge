import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Bot, Boxes, GitBranch, LayoutGrid, List, Network, Plus,
  Search, ShieldCheck, Sparkles, Workflow,
} from 'lucide-react'

import { getAgents, getChains, getMultiAgentSystems, getWorkflows } from '../lib/api'
import { useNavigate } from '../lib/router.jsx'
import '../styles/Studio.css'

const BUILD_MODES = [
  { key:'workflow', eyebrow:'Recommended', title:'Automation', description:'Combine AI decisions, rules, approvals, triggers, and app actions on one canvas.', action:'Create automation', path:'/workflows/new', icon:Workflow },
  { key:'agent', eyebrow:'Conversational', title:'AI assistant', description:'Create a focused agent with instructions, knowledge, tools, versions, and a safe publish flow.', action:'Create assistant', path:'/agents/new', icon:Bot },
  { key:'chain', eyebrow:'Sequential', title:'Agent process', description:'Pass work through a fixed sequence of specialists with traceable handoffs and run history.', action:'Create process', path:'/chains/new', icon:GitBranch },
  { key:'team', eyebrow:'Advanced', title:'Agent team', description:'Coordinate published agents with routing, supervision, limits, and aggregation.', action:'Configure team', path:'/multi-agents', icon:Network },
]

const SOURCE_CONFIG = [
  { key:'workflow', label:'Automation', load:getWorkflows, icon:Workflow, path:item => `/workflows/${item.id}/edit` },
  { key:'agent', label:'Assistant', load:getAgents, icon:Bot, path:item => `/agents/${item.id}/edit` },
  { key:'chain', label:'Process', load:getChains, icon:GitBranch, path:item => `/chains/${item.id}/run` },
  { key:'team', label:'Agent team', load:getMultiAgentSystems, icon:Network, path:() => '/multi-agents' },
]

function normalizeAsset(item, source) {
  return {
    id:`${source.key}-${item.id}`,
    kind:source.key,
    kindLabel:source.label,
    name:item.name || `Untitled ${source.label.toLowerCase()}`,
    description:item.description || 'No description added yet.',
    status:item.status || (item.published_version_id ? 'active' : 'draft'),
    updatedAt:item.updated_at || item.created_at || '',
    path:source.path(item),
    Icon:source.icon,
  }
}

function formatUpdatedAt(value) {
  if (!value) return 'No recent activity'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently updated'
  return new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', year:'numeric' }).format(date)
}

export default function Studio() {
  const navigate = useNavigate()
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState('grid')

  const load = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled(SOURCE_CONFIG.map(source => source.load()))
    const nextAssets = []
    const nextErrors = []
    results.forEach((result, index) => {
      const source = SOURCE_CONFIG[index]
      if (result.status === 'fulfilled') {
        const items = Array.isArray(result.value) ? result.value : []
        nextAssets.push(...items.map(item => normalizeAsset(item, source)))
      } else {
        nextErrors.push(`${source.label} assets could not be loaded.`)
      }
    })
    nextAssets.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    setAssets(nextAssets)
    setErrors(nextErrors)
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return assets.filter(asset => {
      if (filter !== 'all' && asset.kind !== filter) return false
      return !needle || `${asset.name} ${asset.description} ${asset.kindLabel}`.toLowerCase().includes(needle)
    })
  }, [assets, filter, query])

  const counts = useMemo(() => Object.fromEntries(
    SOURCE_CONFIG.map(source => [source.key, assets.filter(asset => asset.kind === source.key).length]),
  ), [assets])

  return (
    <div className="studio-page">
      <header className="studio-hero">
        <div>
          <div className="studio-eyebrow"><Sparkles size={13} /> Unified build workspace</div>
          <h1>Design every AI operation in one Studio.</h1>
          <p>Start with the outcome. AgentForge keeps assistants, deterministic steps, specialist handoffs, approvals, and connected actions together.</p>
        </div>
        <div className="studio-hero-actions">
          <button className="studio-secondary" type="button" onClick={() => navigate('/marketplace')}><Boxes size={16} /> Use a template</button>
          <button className="studio-primary" type="button" onClick={() => navigate('/workflows/new')}><Plus size={16} /> Create automation</button>
        </div>
      </header>

      <section className="studio-trust-strip" aria-label="Studio safety model">
        <ShieldCheck size={18} />
        <div><strong>Governed by default</strong><span>Add approval gates, publish versions, and inspect every production run before increasing autonomy.</span></div>
        <button type="button" onClick={() => navigate('/approvals')}>Open approval inbox <ArrowRight size={13} /></button>
      </section>

      <section className="studio-section">
        <div className="studio-section-heading">
          <div><span>Start something new</span><h2>Choose the shape of the work</h2></div>
          <p>Automation is the best default. Advanced modes remain available when the process needs them.</p>
        </div>
        <div className="studio-mode-grid">
          {BUILD_MODES.map(({ key, eyebrow, title, description, action, path, icon:Icon }) => (
            <article className={`studio-mode-card studio-mode-${key}`} key={key}>
              <div className="studio-mode-top"><span className="studio-mode-icon"><Icon size={19} /></span><small>{eyebrow}</small></div>
              <h3>{title}</h3><p>{description}</p>
              <button type="button" onClick={() => navigate(path)}>{action} <ArrowRight size={13} /></button>
            </article>
          ))}
        </div>
      </section>

      <section className="studio-section">
        <div className="studio-section-heading studio-section-heading-assets">
          <div><span>Your systems</span><h2>Everything you are building</h2></div>
          <div className="studio-view-toggle" aria-label="Asset view">
            <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Grid view"><LayoutGrid size={15} /></button>
            <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="List view"><List size={15} /></button>
          </div>
        </div>
        <div className="studio-toolbar">
          <label className="studio-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search everything in Studio" /></label>
          <div className="studio-filters" aria-label="Filter Studio assets">
            <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <span>{assets.length}</span></button>
            {SOURCE_CONFIG.map(source => <button type="button" className={filter === source.key ? 'active' : ''} key={source.key} onClick={() => setFilter(source.key)}>{source.label} <span>{counts[source.key] || 0}</span></button>)}
          </div>
        </div>

        {errors.length > 0 && <div className="studio-warning"><span>{errors.join(' ')}</span><button type="button" onClick={load}>Try again</button></div>}
        {loading ? (
          <div className="studio-loading"><span className="workspace-spinner" /> Loading your systems…</div>
        ) : filteredAssets.length ? (
          <div className={`studio-assets studio-assets-${view}`}>
            {filteredAssets.map(asset => (
              <button className="studio-asset" type="button" key={asset.id} onClick={() => navigate(asset.path)}>
                <span className={`studio-asset-icon studio-asset-icon-${asset.kind}`}><asset.Icon size={17} /></span>
                <span className="studio-asset-body"><span className="studio-asset-title"><strong>{asset.name}</strong><small>{asset.kindLabel}</small></span><span>{asset.description}</span></span>
                <span className="studio-asset-meta"><small className={`studio-status studio-status-${asset.status}`}>{asset.status}</small><span>{formatUpdatedAt(asset.updatedAt)}</span></span>
                <ArrowRight className="studio-asset-arrow" size={15} />
              </button>
            ))}
          </div>
        ) : (
          <div className="studio-empty">
            <Workflow size={28} />
            <h3>{assets.length ? 'No systems match this view' : 'Build your first governed automation'}</h3>
            <p>{assets.length ? 'Change the filter or search to find another system.' : 'Start with a complete template or create an automation from scratch. Specialized builders remain available inside Studio.'}</p>
            {!assets.length && <button className="studio-primary" type="button" onClick={() => navigate('/marketplace')}>Explore templates <ArrowRight size={14} /></button>}
          </div>
        )}
      </section>
    </div>
  )
}
