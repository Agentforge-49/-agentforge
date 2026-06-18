import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTemplates, useTemplate } from '../lib/api'

const CATEGORY_COLORS = {
  research:   '#3B82F6',
  writing:    '#10B981',
  automation: '#F59E0B',
  support:    '#EC4899',
  data:       '#8B5CF6',
  other:      '#6B7280',
}

const CATEGORY_EMOJIS = {
  research:   '🔍',
  writing:    '✍️',
  automation: '⚙️',
  support:    '🎧',
  data:       '📊',
  other:      '🤖',
}

export default function Marketplace() {
  const navigate = useNavigate()

  const [templates,  setTemplates]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [filter,     setFilter]     = useState('All')
  const [using,      setUsing]      = useState(null)
  const [toast,      setToast]      = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await getTemplates()
        setTemplates(data)
      } catch (err) {
        setError(err.message || 'Failed to load templates')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleUseTemplate = async (template) => {
    setUsing(template.id)
    try {
      await useTemplate(template.id)
      setToast(`✅ "${template.name}" added to your agents!`)
      setTimeout(() => { setToast(''); navigate('/dashboard') }, 2000)
    } catch (err) {
      setToast(`❌ Failed: ${err.message}`)
      setTimeout(() => setToast(''), 3000)
    } finally {
      setUsing(null)
    }
  }

  const categories  = ['All', ...new Set(templates.map(t => t.category).filter(Boolean).map(c => c.charAt(0).toUpperCase() + c.slice(1)))]
  const filtered    = filter === 'All' ? templates : templates.filter(t => t.category?.toLowerCase() === filter.toLowerCase())

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'#9CA3AF', fontSize:14 }}>
      Loading marketplace...
    </div>
  )

  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <div style={{ background:'#2D1515', border:'1px solid #EF4444', borderRadius:12, padding:24, textAlign:'center' }}>
        <p style={{ color:'#FCA5A5', marginBottom:14 }}>⚠️ {error}</p>
        <button onClick={() => window.location.reload()} style={{ background:'#7C3AED', color:'white', border:'none', padding:'8px 18px', borderRadius:8, cursor:'pointer' }}>
          Try again
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ color:'white', fontFamily:'system-ui, sans-serif' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:24, right:24, zIndex:999, background:'#1A1D27', border:'1px solid #2A2D3E', color:'white', padding:'12px 22px', borderRadius:12, fontSize:14, boxShadow:'0 4px 20px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:24, fontWeight:600, marginBottom:4 }}>Template Library</h1>
        <p style={{ color:'#9CA3AF', fontSize:14 }}>Start faster with professionally designed AI agents. Clone any template in one click.</p>
      </div>

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:20, flexWrap:'wrap' }}>
        {categories.map(c => (
          <button key={c} onClick={() => setFilter(c)}
            style={{ padding:'7px 16px', borderRadius:10, border:'none', cursor:'pointer', fontSize:13, fontWeight: filter===c ? 500 : 400, background: filter===c ? '#7C3AED' : '#1A1D27', color: filter===c ? 'white' : '#9CA3AF', transition:'all .15s' }}>
            {c}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ background:'#1A1D27', border:'1px dashed #2A2D3E', borderRadius:16, padding:'60px 20px', textAlign:'center' }}>
          <p style={{ color:'#9CA3AF', fontSize:15 }}>No templates found for this category</p>
        </div>
      )}

      {/* Template grid */}
      {filtered.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
          {filtered.map(template => {
            const cat   = template.category || 'other'
            const color = CATEGORY_COLORS[cat] || '#6B7280'
            const emoji = CATEGORY_EMOJIS[cat]  || '🤖'
            const isLoading = using === template.id

            return (
              <div key={template.id}
                onMouseEnter={e => e.currentTarget.style.borderColor='#7C3AED'}
                onMouseLeave={e => e.currentTarget.style.borderColor='#2A2D3E'}
                style={{ background:'#1A1D27', border:'1px solid #2A2D3E', borderRadius:16, padding:20, display:'flex', flexDirection:'column', transition:'border-color .15s' }}>

                {/* Icon + category */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                  <div style={{ width:48, height:48, background: color+'22', border:`1px solid ${color}44`, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>
                    {emoji}
                  </div>
                  <span style={{ fontSize:11, fontWeight:500, padding:'3px 10px', borderRadius:10, background: color+'22', color }}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </span>
                </div>

                {/* Name + description */}
                <h3 style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>{template.name}</h3>
                <p style={{ fontSize:12, color:'#9CA3AF', lineHeight:1.6, flex:1, marginBottom:14, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical' }}>
                  {template.description || 'No description available'}
                </p>

                {/* Tools */}
                {template.default_tool_slugs?.length > 0 && (
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:14 }}>
                    {template.default_tool_slugs.map(t => (
                      <span key={t} style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'#2A2D3E', color:'#9CA3AF' }}>{t}</span>
                    ))}
                  </div>
                )}

                {/* Use button */}
                <button onClick={() => handleUseTemplate(template)} disabled={isLoading}
                  style={{ width:'100%', background: isLoading ? '#5B21B6' : '#7C3AED', color:'white', border:'none', padding:'11px', borderRadius:10, cursor: isLoading ? 'not-allowed' : 'pointer', fontSize:14, fontWeight:500, transition:'background .15s' }}>
                  {isLoading ? 'Creating...' : '+ Use Template'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
