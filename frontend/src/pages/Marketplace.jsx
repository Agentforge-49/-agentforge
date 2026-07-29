import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck, Bot, Boxes, Download, GitBranch, PackagePlus,
  Search, ShieldCheck, Star, Upload, X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import {
  getAgents,
  getMarketplaceListings,
  getMyMarketplaceListings,
  getWorkflows,
  installMarketplaceListing,
  publishMarketplaceListing,
  reviewMarketplaceListing,
  unlistMarketplaceListing,
  useTemplate as installLegacyTemplate,
} from '../lib/api'

const CATEGORIES = ['all', 'research', 'writing', 'automation', 'support', 'data', 'sales', 'other']
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
const primary = {
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

export default function Marketplace() {
  const navigate = useNavigate()
  const [listings, setListings] = useState([])
  const [mine, setMine] = useState([])
  const [agents, setAgents] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [filters, setFilters] = useState({ q:'', category:'all', type:'', sort:'quality', verified:false })
  const [publishing, setPublishing] = useState(false)
  const [form, setForm] = useState({
    name:'',
    summary:'',
    asset_type:'agent',
    category:'automation',
    resource_id:'',
    tags:'',
    release_notes:'Initial marketplace release',
  })
  const [selected, setSelected] = useState(null)
  const [review, setReview] = useState({ rating:5, review_text:'' })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [marketplace, myListings, agentData, workflowData] = await Promise.all([
        getMarketplaceListings(),
        getMyMarketplaceListings(),
        getAgents(),
        getWorkflows(),
      ])
      setListings(marketplace.listings || [])
      setMine(myListings || [])
      setAgents(agentData.filter(agent => agent.status === 'active' && agent.published_version_id))
      setWorkflows(workflowData.filter(workflow => workflow.status === 'active'))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const filtered = useMemo(() => {
    const term = filters.q.trim().toLowerCase()
    const result = listings.filter(item => (
      (!filters.type || item.asset_type === filters.type)
      && (filters.category === 'all' || item.category === filters.category)
      && (!filters.verified || ['automated', 'curated'].includes(item.verification_status))
      && (!term || item.name.toLowerCase().includes(term)
        || item.summary.toLowerCase().includes(term)
        || item.author_name.toLowerCase().includes(term)
        || item.tags.some(tag => tag.includes(term)))
    ))
    return [...result].sort((left, right) => {
      if (filters.sort === 'popular') return right.install_count - left.install_count
      if (filters.sort === 'rating') return Number(right.rating_average) - Number(left.rating_average)
      if (filters.sort === 'newest') {
        return String(right.published_at || right.created_at)
          .localeCompare(String(left.published_at || left.created_at))
      }
      return right.quality_score - left.quality_score
    })
  }, [listings, filters])

  const resources = form.asset_type === 'agent' ? agents : workflows

  const act = async (key, action, success) => {
    setBusy(key)
    try {
      const result = await action()
      setNotice(success)
      setError('')
      await load()
      return result
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setBusy('')
    }
  }

  const publish = async event => {
    event.preventDefault()
    const result = await act('publish', () => publishMarketplaceListing({
      ...form,
      tags:form.tags.split(',').map(item => item.trim()).filter(Boolean),
    }), 'Listing published with an immutable version snapshot.')
    if (result) {
      setPublishing(false)
      setForm({
        name:'',
        summary:'',
        asset_type:'agent',
        category:'automation',
        resource_id:'',
        tags:'',
        release_notes:'Initial marketplace release',
      })
    }
  }

  const install = async listing => {
    const result = await act(listing.id, () => (
      listing.legacy ? installLegacyTemplate(listing.id) : installMarketplaceListing(listing.id)
    ), `${listing.name} installed as a safe draft.`)
    if (!result) return
    const type = listing.asset_type
    const resourceId = listing.legacy ? result.id : result.resource?.id
    if (type === 'workflow') navigate(`/workflows/${resourceId}/edit`)
    else navigate(`/agents/${resourceId}/edit`)
  }

  const submitReview = async event => {
    event.preventDefault()
    const result = await act('review', () => reviewMarketplaceListing(
      selected.id,
      Number(review.rating),
      review.review_text,
    ), 'Your verified-install review was saved.')
    if (result) {
      setSelected(null)
      setReview({ rating:5, review_text:'' })
    }
  }

  return (
    <div style={{ maxWidth:1250, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:15, alignItems:'end', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:25, margin:'0 0 5px' }}>Template marketplace</h1>
          <p style={{ color:'#8B8FA3', margin:0, fontSize:13 }}>
            Discover trusted agent and workflow snapshots, then install them as editable drafts.
          </p>
        </div>
        <button style={primary} onClick={() => setPublishing(true)}>
          <Upload size={15} /> Publish your work
        </button>
      </div>

      {error && <div style={{ ...panel, borderColor:'#7F1D1D', color:'#FCA5A5', marginBottom:13 }}>{error}</div>}
      {notice && (
        <div style={{ ...panel, borderColor:'#14532D', color:'#86EFAC', marginBottom:13, display:'flex', justifyContent:'space-between' }}>
          {notice}<button onClick={() => setNotice('')} style={{ background:'none', border:0, color:'#86EFAC' }}><X size={15} /></button>
        </div>
      )}

      <div style={{ ...panel, display:'grid', gridTemplateColumns:'minmax(250px,1fr) repeat(3,auto)', gap:9, marginBottom:15 }}>
        <div style={{ position:'relative' }}>
          <Search size={15} style={{ position:'absolute', left:11, top:11, color:'#71717A' }} />
          <input style={{ ...field, paddingLeft:34 }} placeholder="Search name, author, or tag"
            value={filters.q} onChange={event => setFilters({ ...filters, q:event.target.value })} />
        </div>
        <select style={field} value={filters.type}
          onChange={event => setFilters({ ...filters, type:event.target.value })}>
          <option value="">Agents + workflows</option>
          <option value="agent">Agents</option>
          <option value="workflow">Workflows</option>
        </select>
        <select style={field} value={filters.sort}
          onChange={event => setFilters({ ...filters, sort:event.target.value })}>
          <option value="quality">Highest quality</option>
          <option value="popular">Most installed</option>
          <option value="rating">Best rated</option>
          <option value="newest">Newest</option>
        </select>
        <label style={{ ...field, width:'auto', display:'flex', gap:7, alignItems:'center', color:'#C4B5FD', fontSize:12 }}>
          <input type="checkbox" checked={filters.verified}
            onChange={event => setFilters({ ...filters, verified:event.target.checked })} />
          Verified
        </label>
      </div>

      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:17 }}>
        {CATEGORIES.map(category => (
          <button key={category} onClick={() => setFilters({ ...filters, category })}
            style={{
              border:'1px solid',
              borderColor:filters.category === category ? '#7C3AED' : '#252837',
              background:filters.category === category ? 'rgba(124,58,237,.16)' : '#13151C',
              color:filters.category === category ? '#C4B5FD' : '#8B8FA3',
              borderRadius:20,
              padding:'7px 12px',
              cursor:'pointer',
              textTransform:'capitalize',
            }}>{category}</button>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(285px,1fr))', gap:13 }}>
        {filtered.map(listing => {
          const trusted = ['automated', 'curated'].includes(listing.verification_status)
          const hasInstall = Boolean(listing.installed_version_id)
          return (
            <article key={`${listing.legacy ? 'legacy-' : ''}${listing.id}`} style={{ ...panel, display:'flex', flexDirection:'column' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
                <div style={{ width:40, height:40, borderRadius:10, background:'rgba(124,58,237,.14)', display:'grid', placeItems:'center', color:'#A78BFA' }}>
                  {listing.asset_type === 'workflow' ? <GitBranch size={19} /> : <Bot size={19} />}
                </div>
                <div style={{ display:'flex', gap:5 }}>
                  {trusted && (
                    <span title={listing.verification_status} style={{ color:listing.verification_status === 'curated' ? '#FBBF24' : '#86EFAC' }}>
                      {listing.verification_status === 'curated' ? <BadgeCheck size={17} /> : <ShieldCheck size={17} />}
                    </span>
                  )}
                  <span style={{ color:'#A1A1AA', fontSize:11, textTransform:'capitalize' }}>{listing.asset_type}</span>
                </div>
              </div>
              <h3 style={{ margin:'13px 0 5px', fontSize:15 }}>{listing.name}</h3>
              <p style={{ color:'#8B8FA3', fontSize:12, lineHeight:1.55, minHeight:55, flex:1 }}>{listing.summary}</p>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap', minHeight:24 }}>
                {listing.tags.slice(0, 5).map(tag => (
                  <span key={tag} style={{ background:'#222531', color:'#A1A1AA', borderRadius:10, padding:'3px 7px', fontSize:10 }}>{tag}</span>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5, margin:'13px 0', color:'#A1A1AA', fontSize:11 }}>
                <span>Quality {listing.quality_score}</span>
                <span><Download size={11} /> {listing.install_count}</span>
                <span><Star size={11} /> {Number(listing.rating_average).toFixed(1)} ({listing.rating_count})</span>
              </div>
              <div style={{ color:'#71717A', fontSize:10, marginBottom:9 }}>
                by {listing.author_name} · v{listing.current_version} · schema {listing.compatibility_min}–{listing.compatibility_max}
              </div>
              <div style={{ display:'flex', gap:7 }}>
                <button style={{ ...primary, flex:1 }} disabled={busy === listing.id || listing.compatible === false}
                  onClick={() => install(listing)}>
                  <PackagePlus size={14} />
                  {busy === listing.id ? 'Installing…' : hasInstall ? 'Install update' : 'Install draft'}
                </button>
                {!listing.legacy && hasInstall && (
                  <button title="Review" style={{ ...primary, background:'#27272A', padding:'9px 11px' }}
                    onClick={() => setSelected(listing)}><Star size={14} /></button>
                )}
              </div>
            </article>
          )
        })}
      </div>
      {!filtered.length && (
        <div style={{ ...panel, textAlign:'center', color:'#71717A', padding:50 }}>
          No compatible templates match these filters.
        </div>
      )}

      {mine.length > 0 && (
        <section style={{ marginTop:25 }}>
          <h2 style={{ fontSize:17 }}>Your published listings</h2>
          <div style={{ ...panel, padding:0 }}>
            {mine.map(item => (
              <div key={item.id} style={{ display:'flex', alignItems:'center', gap:10, padding:13, borderBottom:'1px solid #252837' }}>
                <Boxes size={15} color="#A78BFA" />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13 }}>{item.name} · v{item.current_version}</div>
                  <div style={{ color:'#71717A', fontSize:11 }}>
                    {item.status} · {item.install_count} installs · {item.versions.length} immutable versions
                  </div>
                </div>
                {item.status === 'published' && (
                  <button style={{ ...primary, background:'#27272A', padding:'7px 10px' }}
                    onClick={() => act(`unlist-${item.id}`, () => unlistMarketplaceListing(item.id), 'Listing removed from discovery.')}>
                    Unlist
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {publishing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.72)', display:'grid', placeItems:'center', zIndex:20, padding:20 }}>
          <form onSubmit={publish} style={{ ...panel, width:'min(620px,100%)', maxHeight:'90vh', overflow:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <div>
                <h2 style={{ margin:'0 0 4px', fontSize:19 }}>Publish to marketplace</h2>
                <p style={{ color:'#8B8FA3', fontSize:12, marginTop:0 }}>The active configuration is copied into an immutable version.</p>
              </div>
              <button type="button" onClick={() => setPublishing(false)} style={{ background:'none', border:0, color:'#A1A1AA' }}><X /></button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
              <select style={field} value={form.asset_type}
                onChange={event => setForm({ ...form, asset_type:event.target.value, resource_id:'' })}>
                <option value="agent">Agent</option>
                <option value="workflow">Workflow</option>
              </select>
              <select style={field} value={form.category}
                onChange={event => setForm({ ...form, category:event.target.value })}>
                {CATEGORIES.slice(1).map(category => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <select style={{ ...field, marginTop:9 }} value={form.resource_id}
              onChange={event => {
                const resource = resources.find(item => item.id === event.target.value)
                setForm({ ...form, resource_id:event.target.value, name:form.name || resource?.name || '' })
              }}>
              <option value="">Choose an active {form.asset_type}</option>
              {resources.map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
            </select>
            <input style={{ ...field, marginTop:9 }} placeholder="Public listing name" value={form.name}
              onChange={event => setForm({ ...form, name:event.target.value })} />
            <textarea style={{ ...field, marginTop:9, minHeight:90 }} placeholder="What it does, who it helps, and what makes it trustworthy"
              value={form.summary} onChange={event => setForm({ ...form, summary:event.target.value })} />
            <input style={{ ...field, marginTop:9 }} placeholder="Tags separated by commas"
              value={form.tags} onChange={event => setForm({ ...form, tags:event.target.value })} />
            <textarea style={{ ...field, marginTop:9, minHeight:65 }} placeholder="Release notes"
              value={form.release_notes} onChange={event => setForm({ ...form, release_notes:event.target.value })} />
            <button style={{ ...primary, marginTop:11 }} disabled={busy === 'publish' || !form.resource_id}>
              <Upload size={14} /> {busy === 'publish' ? 'Publishing…' : 'Publish immutable v1'}
            </button>
          </form>
        </div>
      )}

      {selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.72)', display:'grid', placeItems:'center', zIndex:20, padding:20 }}>
          <form onSubmit={submitReview} style={{ ...panel, width:'min(470px,100%)' }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <h2 style={{ margin:0, fontSize:18 }}>Review {selected.name}</h2>
              <button type="button" onClick={() => setSelected(null)} style={{ background:'none', border:0, color:'#A1A1AA' }}><X /></button>
            </div>
            <p style={{ color:'#8B8FA3', fontSize:12 }}>Only users with a verified install can submit a review.</p>
            <select style={field} value={review.rating}
              onChange={event => setReview({ ...review, rating:event.target.value })}>
              {[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} stars</option>)}
            </select>
            <textarea style={{ ...field, marginTop:9, minHeight:90 }} placeholder="Optional review"
              value={review.review_text}
              onChange={event => setReview({ ...review, review_text:event.target.value })} />
            <button style={{ ...primary, marginTop:10 }} disabled={busy === 'review'}>Save review</button>
          </form>
        </div>
      )}
    </div>
  )
}
