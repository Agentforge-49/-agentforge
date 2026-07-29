import { useEffect, useState } from 'react'
import { useNavigate, useParams } from '../lib/router.jsx'
import {
  ArrowLeft,
  CheckCircle2,
  History,
  Pause,
  Pencil,
  Play,
  RotateCcw,
} from 'lucide-react'

import {
  getAgent,
  getAgentVersions,
  pauseAgent,
  resumeAgent,
  rollbackAgent,
} from '../lib/api'

function formatDate(value) {
  return new Date(value).toLocaleString()
}

async function fetchVersionData(agentId) {
  const [agentData, versionData] = await Promise.all([
    getAgent(agentId),
    getAgentVersions(agentId),
  ])
  return {
    agent: agentData,
    versions: versionData.versions || [],
  }
}

export default function AgentVersions() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [agent, setAgent] = useState(null)
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true

    async function loadInitialData() {
      try {
        const data = await fetchVersionData(id)
        if (!active) return
        setAgent(data.agent)
        setVersions(data.versions)
      } catch (err) {
        if (active) setError(err.message || 'Failed to load version history')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadInitialData()
    return () => {
      active = false
    }
  }, [id])

  const handleRollback = async version => {
    if (!window.confirm(`Create a new published version from version ${version.version_number}?`)) {
      return
    }

    setWorking(version.id)
    setError('')
    setNotice('')
    try {
      const result = await rollbackAgent(
        id,
        version.id,
        `Rollback to version ${version.version_number}`,
      )
      setNotice(`Version ${result.version.version_number} published from version ${version.version_number}.`)
      const refreshed = await fetchVersionData(id)
      setAgent(refreshed.agent)
      setVersions(refreshed.versions)
    } catch (err) {
      setError(err.message || 'Rollback failed')
    } finally {
      setWorking('')
    }
  }

  const togglePaused = async () => {
    setWorking('status')
    setError('')
    setNotice('')
    try {
      const updated = agent.status === 'paused'
        ? await resumeAgent(id)
        : await pauseAgent(id)
      setAgent(updated)
      setNotice(updated.status === 'paused' ? 'Agent paused.' : 'Agent resumed.')
    } catch (err) {
      setError(err.message || 'Could not change agent status')
    } finally {
      setWorking('')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80, color: '#9CA3AF' }}>
        Loading version history...
      </div>
    )
  }

  if (!agent) {
    return (
      <div style={{ color: '#FCA5A5', padding: 40 }}>
        {error || 'Agent not found'}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid #2A2D3E', color: '#9CA3AF', padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }}
        >
          <ArrowLeft size={14} /> Dashboard
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>{agent.name} versions</h1>
          <p style={{ color: '#9CA3AF', fontSize: 13, marginTop: 3 }}>
            Published versions are immutable. Rollback creates a new version from an earlier snapshot.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate(`/agents/${id}/edit`)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#7C3AED', color: 'white', border: 'none', borderRadius: 9, cursor: 'pointer' }}
        >
          <Pencil size={14} /> Edit draft
        </button>
        <button
          onClick={() => navigate(`/agents/${id}/run`)}
          disabled={!agent.published_version_id || agent.status !== 'active'}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#1A1D27', color: '#C4B5FD', border: '1px solid #4C1D95', borderRadius: 9, cursor: 'pointer' }}
        >
          <Play size={14} /> Run published version
        </button>
        {agent.published_version_id && (
          <button
            onClick={togglePaused}
            disabled={working === 'status'}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#1A1D27', color: '#FCD34D', border: '1px solid #78350F', borderRadius: 9, cursor: 'pointer' }}
          >
            {agent.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
            {agent.status === 'paused' ? 'Resume agent' : 'Pause agent'}
          </button>
        )}
      </div>

      {agent.has_unpublished_changes && (
        <div style={{ background: '#422006', border: '1px solid #92400E', color: '#FCD34D', borderRadius: 11, padding: '12px 15px', fontSize: 13, marginBottom: 16 }}>
          This agent has unpublished draft changes. Runs still use version {agent.latest_version_number}.
        </div>
      )}
      {notice && (
        <div style={{ background: '#052E2B', border: '1px solid #059669', color: '#A7F3D0', borderRadius: 11, padding: '12px 15px', fontSize: 13, marginBottom: 16 }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ background: '#2D1515', border: '1px solid #EF4444', color: '#FCA5A5', borderRadius: 11, padding: '12px 15px', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {versions.length === 0 ? (
        <div style={{ background: '#1A1D27', border: '1px dashed #2A2D3E', borderRadius: 16, padding: 50, textAlign: 'center' }}>
          <History size={36} color="#4B5563" />
          <h2 style={{ fontSize: 17, marginTop: 12 }}>No published versions yet</h2>
          <p style={{ color: '#9CA3AF', fontSize: 13, marginTop: 7 }}>
            Edit this draft and publish it when the configuration is ready.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {versions.map(version => {
            const isCurrent = version.id === agent.published_version_id
            return (
              <div
                key={version.id}
                style={{
                  background: '#1A1D27',
                  border: `1px solid ${isCurrent ? '#7C3AED' : '#2A2D3E'}`,
                  borderRadius: 14,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h2 style={{ fontSize: 16, fontWeight: 600 }}>Version {version.version_number}</h2>
                      {isCurrent && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#A7F3D0', background: '#065F4655', padding: '3px 7px', borderRadius: 7, fontSize: 11 }}>
                          <CheckCircle2 size={12} /> Published
                        </span>
                      )}
                      {version.source_version_id && (
                        <span style={{ color: '#C4B5FD', background: '#4C1D9555', padding: '3px 7px', borderRadius: 7, fontSize: 11 }}>
                          Rollback
                        </span>
                      )}
                    </div>
                    <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 5 }}>
                      {formatDate(version.published_at)}
                    </p>
                    <p style={{ color: '#D1D5DB', fontSize: 13, marginTop: 9 }}>
                      {version.change_summary || 'No version note'}
                    </p>
                  </div>

                  {!isCurrent && (
                    <button
                      onClick={() => handleRollback(version)}
                      disabled={working === version.id}
                      style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6, background: '#1F1636', border: '1px solid #6D28D9', color: '#C4B5FD', padding: '0 11px', borderRadius: 8, cursor: 'pointer' }}
                    >
                      <RotateCcw size={13} />
                      {working === version.id ? 'Rolling back...' : 'Rollback'}
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 16 }}>
                  {[
                    ['Model', version.model],
                    ['Temperature', version.temperature],
                    ['Max tokens', version.max_tokens],
                    ['Tools', version.tool_slugs?.length || 0],
                  ].map(([label, value]) => (
                    <div key={label} style={{ background: '#0F1117', borderRadius: 8, padding: '9px 10px' }}>
                      <div style={{ color: '#6B7280', fontSize: 10, textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ color: '#D1D5DB', fontSize: 12, marginTop: 3 }}>{String(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
