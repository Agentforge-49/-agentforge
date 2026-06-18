import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, Calculator, CalendarClock, Check, FileText, Globe, Search } from 'lucide-react'
import { createAgent } from '../lib/api'

// Maps display names to API values
const MODEL_MAP = {
  'Claude Sonnet 4': 'claude-sonnet-4-6',
  'Claude Opus 4':   'claude-opus-4-6',
  'GPT-4o':          'gpt-4o',
  'Gemini Pro':      'gemini-pro'
}

const TOOL_MAP = {
  'Web Search': 'web_search',
  'Calculator': 'calculator',
  'Memory':     'memory',
  'Summarizer': 'summarizer',
  'Date & Time':'datetime'
}

const TOOLS = [
  { name: 'Web Search', description: 'Search the internet for current info',   icon: Search,      disabled: false },
  { name: 'Calculator', description: 'Solve math and calculations',             icon: Calculator,  disabled: false },
  { name: 'Memory',     description: 'Remember info across sessions',           icon: Brain,       disabled: false },
  { name: 'Summarizer', description: 'Summarize long documents',                icon: FileText,    disabled: false },
  { name: 'Date & Time',description: 'Get dates, times, and calendars',         icon: CalendarClock, disabled: false },
  { name: 'Webhook',    description: 'Make HTTP requests to any URL',           icon: Globe,       disabled: true  },
]

const PERSONALITIES = ['Professional', 'Friendly', 'Concise', 'Creative']

export default function CreateAgent() {
  const navigate = useNavigate()

  const [step,      setStep]      = useState(1)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [showToast, setShowToast] = useState(false)

  const [formData, setFormData] = useState({
    name:         '',
    description:  '',
    category:     'Research',
    systemPrompt: '',
    personality:  'Professional',
    tools:        ['Web Search'],
    model:        'Claude Sonnet 4',
    temperature:  0.7,
    maxTokens:    1000,
  })

  const update = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  const toggleTool = (tool) => {
    if (tool.disabled) return
    setFormData(prev => ({
      ...prev,
      tools: prev.tools.includes(tool.name)
        ? prev.tools.filter(t => t !== tool.name)
        : [...prev.tools, tool.name]
    }))
  }

  const handleLaunch = async () => {
    setLoading(true)
    setError('')
    try {
      await createAgent({
        name:         formData.name,
        description:  formData.description,
        category:     formData.category.toLowerCase().replace(' ', '_'),
        system_prompt:formData.systemPrompt,
        personality:  formData.personality.toLowerCase(),
        model:        MODEL_MAP[formData.model] || 'claude-sonnet-4-6',
        temperature:  parseFloat(formData.temperature),
        max_tokens:   parseInt(formData.maxTokens),
        tool_slugs:   formData.tools.map(t => TOOL_MAP[t]).filter(Boolean)
      })
      setShowToast(true)
      setTimeout(() => navigate('/dashboard'), 1500)
    } catch (err) {
      setError(err.message || 'Failed to create agent. Please try again.')
      setLoading(false)
    }
  }

  const inputStyle = { width: '100%', background: '#0F1117', border: '1px solid #2A2D3E', borderRadius: 10, padding: '11px 14px', color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'system-ui' }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', color: 'white', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Success toast ── */}
      {showToast && (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 999, background: '#7C3AED', color: 'white', padding: '12px 22px', borderRadius: 12, fontWeight: 500, boxShadow: '0 4px 20px rgba(124,58,237,0.4)' }}>
          ✅ Agent created!
        </div>
      )}

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>Create New Agent</h1>
        <p style={{ color: '#9CA3AF', fontSize: 14 }}>Configure your AI agent step by step.</p>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>
          <span>Step {step} of 5</span>
          <span>{Math.round((step / 5) * 100)}%</span>
        </div>
        <div style={{ width: '100%', height: 6, background: '#1A1D27', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: '#7C3AED', width: `${(step / 5) * 100}%`, transition: 'width .3s ease', borderRadius: 10 }} />
        </div>
      </div>

      {/* ── Step card ── */}
      <div style={{ background: '#1A1D27', border: '1px solid #2A2D3E', borderRadius: 16, padding: 24 }}>

        {/* STEP 1 — Basic Info */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Basic Info</h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>Agent Name *</label>
              <input value={formData.name} onChange={e => update('name', e.target.value)} placeholder="e.g. Research Pro" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>Description</label>
              <textarea rows={4} value={formData.description} onChange={e => update('description', e.target.value)} placeholder="What does this agent do?" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>Category</label>
              <select value={formData.category} onChange={e => update('category', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {['Research','Writing','Customer Support','Data Analysis','Automation','Other'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* STEP 2 — Personality */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Personality</h2>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>System Prompt</label>
              <textarea rows={8} value={formData.systemPrompt} onChange={e => update('systemPrompt', e.target.value)} placeholder="You are an expert AI assistant that..." style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              {PERSONALITIES.map(p => (
                <button key={p} onClick={() => update('personality', p)} style={{ padding: 16, borderRadius: 12, border: `1px solid ${formData.personality === p ? '#7C3AED' : '#2A2D3E'}`, background: formData.personality === p ? 'rgba(124,58,237,0.1)' : '#0F1117', color: 'white', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>{p}</div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {{ Professional: 'Precise and formal', Friendly: 'Warm and conversational', Concise: 'Brief and direct', Creative: 'Imaginative and vivid' }[p]}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3 — Tools */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Tools</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              {TOOLS.map(tool => {
                const Icon     = tool.icon
                const selected = formData.tools.includes(tool.name)
                return (
                  <button key={tool.name} onClick={() => toggleTool(tool)} disabled={tool.disabled}
                    style={{ padding: 16, borderRadius: 12, border: `1px solid ${selected ? '#7C3AED' : '#2A2D3E'}`, background: selected ? 'rgba(124,58,237,0.1)' : '#0F1117', color: 'white', cursor: tool.disabled ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: tool.disabled ? 0.5 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Icon size={18} color="#7C3AED" />
                      {selected && <Check size={16} color="#34D399" />}
                    </div>
                    <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 3 }}>
                      {tool.name}
                      {tool.disabled && <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(245,158,11,0.2)', color: '#FCD34D', padding: '2px 6px', borderRadius: 6 }}>Pro</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#9CA3AF' }}>{tool.description}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* STEP 4 — Model */}
        {step === 4 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Model Settings</h2>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>Model</label>
              <select value={formData.model} onChange={e => update('model', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {Object.keys(MODEL_MAP).map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>
                <span>Temperature</span><span>{formData.temperature}</span>
              </div>
              <input type="range" min="0" max="1" step="0.1" value={formData.temperature} onChange={e => update('temperature', e.target.value)} style={{ width: '100%', accentColor: '#7C3AED' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                <span>Precise</span><span>Creative</span>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>Max Tokens</label>
              <input type="number" value={formData.maxTokens} onChange={e => update('maxTokens', e.target.value)} style={inputStyle} />
            </div>
          </div>
        )}

        {/* STEP 5 — Review */}
        {step === 5 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Review & Launch</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                ['Name',        formData.name        || 'Untitled'],
                ['Description', formData.description || 'No description'],
                ['Category',    formData.category],
                ['Personality', formData.personality],
                ['Tools',       formData.tools.length ? formData.tools.join(', ') : 'None'],
                ['Model',       formData.model],
                ['Temperature', formData.temperature],
                ['Max Tokens',  formData.maxTokens],
              ].map(([label, value]) => (
                <div key={label} style={{ background: '#0F1117', border: '1px solid #2A2D3E', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
                  <div style={{ fontSize: 14 }}>{String(value)}</div>
                </div>
              ))}
            </div>

            {error && (
              <div style={{ background: '#2D1515', border: '1px solid #EF4444', borderRadius: 10, padding: '12px 16px', color: '#FCA5A5', fontSize: 13, marginBottom: 16 }}>
                ⚠️ {error}
              </div>
            )}

            <button onClick={handleLaunch} disabled={loading || !formData.name}
              style={{ width: '100%', background: loading || !formData.name ? '#5B21B6' : '#7C3AED', color: 'white', border: 'none', padding: 14, borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: loading || !formData.name ? 'not-allowed' : 'pointer', transition: 'background .15s' }}>
              {loading ? 'Creating agent...' : '🚀 Launch Agent'}
            </button>
            {!formData.name && <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 8 }}>Go back to Step 1 and add a name</p>}
          </div>
        )}

        {/* ── Nav buttons ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button onClick={() => setStep(s => s - 1)} disabled={step === 1}
            style={{ padding: '10px 22px', borderRadius: 10, border: '1px solid #2A2D3E', background: 'transparent', color: step === 1 ? '#4B5563' : 'white', cursor: step === 1 ? 'not-allowed' : 'pointer', fontSize: 14 }}>
            Back
          </button>
          {step < 5 && (
            <button onClick={() => setStep(s => s + 1)}
              style={{ padding: '10px 22px', borderRadius: 10, background: '#7C3AED', border: 'none', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
