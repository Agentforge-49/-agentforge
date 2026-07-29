import { useEffect, useState } from 'react'
import { useNavigate, useParams } from '../lib/router.jsx'
import {
  Brain,
  Calculator,
  CalendarClock,
  Check,
  FileSearch,
  FileText,
  Globe,
  History,
  Search,
} from 'lucide-react'

import {
  createAgent,
  getAgent,
  publishAgent,
  updateAgent,
} from '../lib/api'

const MODEL_MAP = {
  'Claude Sonnet 4': 'claude-sonnet-4-6',
  'Claude Opus 4': 'claude-opus-4-6',
}

const MODEL_LABELS = Object.fromEntries(
  Object.entries(MODEL_MAP).map(([label, value]) => [value, label]),
)

const TOOL_MAP = {
  'Web Search': 'web_search',
  Calculator: 'calculator',
  Memory: 'memory',
  Summarizer: 'summarizer',
  'Date & Time': 'datetime',
  Webhook: 'webhook',
  'Read Webpage': 'read_webpage',
}

const TOOL_LABELS = Object.fromEntries(
  Object.entries(TOOL_MAP).map(([label, value]) => [value, label]),
)

const TOOLS = [
  { name: 'Web Search', description: 'Search the internet for current information', icon: Search },
  { name: 'Calculator', description: 'Solve math and calculations', icon: Calculator },
  { name: 'Memory', description: 'Remember information across sessions', icon: Brain },
  { name: 'Summarizer', description: 'Summarize long documents', icon: FileText },
  { name: 'Date & Time', description: 'Get dates, times, and calendar information', icon: CalendarClock },
  { name: 'Webhook', description: 'Call an API or trigger a webhook', icon: Globe },
  { name: 'Read Webpage', description: 'Fetch and read a specific webpage', icon: FileSearch },
]

const PERSONALITIES = ['Professional', 'Friendly', 'Concise', 'Creative']
const CATEGORY_MAP = {
  Research: 'research',
  Writing: 'writing',
  'Customer Support': 'support',
  'Data Analysis': 'data',
  Automation: 'automation',
  Other: 'other',
}
const CATEGORY_LABELS = Object.fromEntries(
  Object.entries(CATEGORY_MAP).map(([label, value]) => [value, label]),
)

const EMPTY_FORM = {
  name: '',
  description: '',
  category: 'Research',
  systemPrompt: '',
  personality: 'Professional',
  tools: ['Web Search'],
  model: 'Claude Sonnet 4',
  temperature: 0.7,
  maxTokens: 1000,
}

const inputStyle = {
  width: '100%',
  background: '#0F1117',
  border: '1px solid #2A2D3E',
  borderRadius: 10,
  padding: '11px 14px',
  color: 'white',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'system-ui',
}

function toPayload(formData) {
  return {
    name: formData.name,
    description: formData.description,
    category: CATEGORY_MAP[formData.category] || 'other',
    system_prompt: formData.systemPrompt,
    personality: formData.personality.toLowerCase(),
    model: MODEL_MAP[formData.model] || 'claude-sonnet-4-6',
    temperature: Number(formData.temperature),
    max_tokens: Number(formData.maxTokens),
    tool_slugs: formData.tools.map(tool => TOOL_MAP[tool]).filter(Boolean),
  }
}

function fromAgent(agent) {
  return {
    name: agent.name || '',
    description: agent.description || '',
    category: CATEGORY_LABELS[agent.category] || 'Other',
    systemPrompt: agent.system_prompt || '',
    personality: agent.personality
      ? `${agent.personality[0].toUpperCase()}${agent.personality.slice(1)}`
      : 'Professional',
    tools: (agent.tools || []).map(tool => TOOL_LABELS[tool.slug]).filter(Boolean),
    model: MODEL_LABELS[agent.model] || 'Claude Sonnet 4',
    temperature: agent.temperature ?? 0.7,
    maxTokens: agent.max_tokens || 1000,
  }
}

export default function CreateAgent() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(id)

  const [agent, setAgent] = useState(null)
  const [step, setStep] = useState(1)
  const [loadingAgent, setLoadingAgent] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [changeSummary, setChangeSummary] = useState('')
  const [formData, setFormData] = useState(EMPTY_FORM)

  useEffect(() => {
    if (!id) return

    async function loadAgent() {
      try {
        const data = await getAgent(id)
        setAgent(data)
        setFormData(fromAgent(data))
      } catch (err) {
        setError(err.message || 'Failed to load the agent')
      } finally {
        setLoadingAgent(false)
      }
    }

    loadAgent()
  }, [id])

  const update = (field, value) => {
    setFormData(current => ({ ...current, [field]: value }))
    setNotice('')
  }

  const toggleTool = (toolName) => {
    setFormData(current => ({
      ...current,
      tools: current.tools.includes(toolName)
        ? current.tools.filter(tool => tool !== toolName)
        : [...current.tools, toolName],
    }))
    setNotice('')
  }

  const saveDraft = async () => {
    const payload = toPayload(formData)
    return isEditing ? updateAgent(id, payload) : createAgent(payload)
  }

  const handleSaveDraft = async () => {
    if (!formData.name.trim()) {
      setError('Add an agent name before saving the draft')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await saveDraft()
      setAgent(saved)
      setNotice('Draft saved. Runs continue using the last published version.')
      if (!isEditing) navigate(`/agents/${saved.id}/edit`, { replace: true })
    } catch (err) {
      setError(err.message || 'Failed to save the draft')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!formData.name.trim()) {
      setError('Add an agent name before publishing')
      return
    }
    if (formData.systemPrompt.trim().length < 10) {
      setError('A published agent needs a system prompt of at least 10 characters')
      setStep(2)
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await saveDraft()
      const result = await publishAgent(saved.id, changeSummary)
      setAgent(result.agent)
      setNotice(`Version ${result.version.version_number} published successfully.`)
      navigate(`/agents/${saved.id}/versions`)
    } catch (err) {
      setError(err.message || 'Failed to publish the agent')
    } finally {
      setSaving(false)
    }
  }

  const goNext = () => {
    setError('')
    if (step === 1 && !formData.name.trim()) {
      setError('Agent name is required')
      return
    }
    setStep(current => Math.min(current + 1, 5))
  }

  if (loadingAgent) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80, color: '#9CA3AF' }}>
        Loading agent draft...
      </div>
    )
  }

  const lifecycleLabel = !agent?.published_version_id
    ? 'Draft'
    : agent.has_unpublished_changes
      ? `Published v${agent.latest_version_number} · Draft changes`
      : `Published v${agent.latest_version_number}`

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>
            {isEditing ? 'Edit Agent Draft' : 'Create New Agent'}
          </h1>
          <p style={{ color: '#9CA3AF', fontSize: 14 }}>
            Save changes safely as a draft, then publish an immutable version when it is ready.
          </p>
          {isEditing && (
            <span style={{
              display: 'inline-flex',
              marginTop: 10,
              padding: '4px 9px',
              borderRadius: 8,
              fontSize: 12,
              color: agent?.has_unpublished_changes ? '#FCD34D' : '#A7F3D0',
              background: agent?.has_unpublished_changes ? '#78350F55' : '#065F4655',
            }}>
              {lifecycleLabel}
            </span>
          )}
        </div>

        {isEditing && (
          <button
            onClick={() => navigate(`/agents/${id}/versions`)}
            style={{
              height: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: '#1A1D27',
              border: '1px solid #2A2D3E',
              color: '#C4B5FD',
              borderRadius: 10,
              padding: '0 14px',
              cursor: 'pointer',
            }}
          >
            <History size={15} /> Version history
          </button>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>
          <span>Step {step} of 5</span>
          <span>{Math.round((step / 5) * 100)}%</span>
        </div>
        <div style={{ width: '100%', height: 6, background: '#1A1D27', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: '#7C3AED', width: `${(step / 5) * 100}%`, transition: 'width .3s ease' }} />
        </div>
      </div>

      <div style={{ background: '#1A1D27', border: '1px solid #2A2D3E', borderRadius: 16, padding: 24 }}>
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Basic information</h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>Agent name *</label>
              <input
                value={formData.name}
                maxLength={80}
                onChange={event => update('name', event.target.value)}
                placeholder="e.g. Research Pro"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>Description</label>
              <textarea
                rows={4}
                maxLength={500}
                value={formData.description}
                onChange={event => update('description', event.target.value)}
                placeholder="What does this agent do?"
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>Category</label>
              <select
                value={formData.category}
                onChange={event => update('category', event.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {Object.keys(CATEGORY_MAP).map(category => <option key={category}>{category}</option>)}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 6 }}>Prompt and personality</h2>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 18 }}>
              Publishing requires a clear system prompt of at least 10 characters.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>System prompt</label>
              <textarea
                rows={8}
                maxLength={12000}
                value={formData.systemPrompt}
                onChange={event => update('systemPrompt', event.target.value)}
                placeholder="You are an expert AI assistant that..."
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <div style={{ color: '#6B7280', fontSize: 11, textAlign: 'right', marginTop: 5 }}>
                {formData.systemPrompt.length} / 12,000
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {PERSONALITIES.map(personality => (
                <button
                  key={personality}
                  onClick={() => update('personality', personality)}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: `1px solid ${formData.personality === personality ? '#7C3AED' : '#2A2D3E'}`,
                    background: formData.personality === personality ? 'rgba(124,58,237,0.1)' : '#0F1117',
                    color: 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>{personality}</div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {{
                      Professional: 'Precise and formal',
                      Friendly: 'Warm and conversational',
                      Concise: 'Brief and direct',
                      Creative: 'Imaginative and vivid',
                    }[personality]}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 6 }}>Tools</h2>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 16 }}>
              Tool selection is captured inside every published version.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {TOOLS.map(tool => {
                const Icon = tool.icon
                const selected = formData.tools.includes(tool.name)
                return (
                  <button
                    key={tool.name}
                    onClick={() => toggleTool(tool.name)}
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      border: `1px solid ${selected ? '#7C3AED' : '#2A2D3E'}`,
                      background: selected ? 'rgba(124,58,237,0.1)' : '#0F1117',
                      color: 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Icon size={18} color="#7C3AED" />
                      {selected && <Check size={16} color="#34D399" />}
                    </div>
                    <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 3 }}>{tool.name}</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF' }}>{tool.description}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Model controls</h2>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>Model</label>
              <select
                value={formData.model}
                onChange={event => update('model', event.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {Object.keys(MODEL_MAP).map(model => <option key={model}>{model}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>
                <span>Temperature</span>
                <span>{formData.temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={formData.temperature}
                onChange={event => update('temperature', event.target.value)}
                style={{ width: '100%', accentColor: '#7C3AED' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>Max tokens</label>
              <input
                type="number"
                min="1"
                max="8192"
                value={formData.maxTokens}
                onChange={event => update('maxTokens', event.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Review and publish</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
              {[
                ['Name', formData.name || 'Untitled'],
                ['Category', formData.category],
                ['Personality', formData.personality],
                ['Model', formData.model],
                ['Tools', formData.tools.length ? formData.tools.join(', ') : 'None'],
                ['Max tokens', formData.maxTokens],
              ].map(([label, value]) => (
                <div key={label} style={{ background: '#0F1117', border: '1px solid #2A2D3E', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontSize: 13 }}>{String(value)}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#9CA3AF', marginBottom: 6 }}>
                Version note (optional)
              </label>
              <input
                value={changeSummary}
                maxLength={500}
                onChange={event => setChangeSummary(event.target.value)}
                placeholder="What changed in this version?"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                style={{
                  padding: 13,
                  borderRadius: 11,
                  border: '1px solid #4C1D95',
                  background: '#1A1D27',
                  color: '#C4B5FD',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                onClick={handlePublish}
                disabled={saving}
                style={{
                  padding: 13,
                  borderRadius: 11,
                  border: 'none',
                  background: saving ? '#5B21B6' : '#7C3AED',
                  color: 'white',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Publishing...' : isEditing ? 'Publish New Version' : 'Publish Agent'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: '#2D1515', border: '1px solid #EF4444', borderRadius: 10, padding: '11px 14px', color: '#FCA5A5', fontSize: 13, marginTop: 16 }}>
            {error}
          </div>
        )}
        {notice && (
          <div style={{ background: '#052E2B', border: '1px solid #059669', borderRadius: 10, padding: '11px 14px', color: '#A7F3D0', fontSize: 13, marginTop: 16 }}>
            {notice}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button
            onClick={() => setStep(current => Math.max(current - 1, 1))}
            disabled={step === 1}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              border: '1px solid #2A2D3E',
              background: 'transparent',
              color: step === 1 ? '#4B5563' : 'white',
              cursor: step === 1 ? 'not-allowed' : 'pointer',
            }}
          >
            Back
          </button>
          {step < 5 && (
            <button
              onClick={goNext}
              style={{ padding: '10px 22px', borderRadius: 10, background: '#7C3AED', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 500 }}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
