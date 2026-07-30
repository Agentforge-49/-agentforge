import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive, Building2, Check, Clipboard, Download, FileClock, FolderKanban,
  KeyRound, Plus, RefreshCw, ShieldCheck, UserPlus, Users, X,
} from 'lucide-react'

import {
  acceptOrganizationInvitation,
  archiveOrganization,
  cancelGovernanceChange,
  cloneOrganizationResource,
  createOrganization,
  decideGovernanceChange,
  downloadComplianceExport,
  getOrganization,
  getOrganizationAudit,
  getOrganizationResourceOptions,
  getOrganizations,
  inviteOrganizationMember,
  removeOrganizationMember,
  revokeOrganizationInvitation,
  shareOrganizationResource,
  unshareOrganizationResource,
  updateOrganizationMember,
  updateOrganizationPolicy,
} from '../lib/api'

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
const secondary = {
  ...primary,
  background:'#1C1F2A',
  border:'1px solid #303445',
  color:'#D4D4D8',
}
const danger = {
  ...secondary,
  color:'#FCA5A5',
  border:'1px solid #7F1D1D',
}
const tabs = [
  ['overview', Building2, 'Overview'],
  ['members', Users, 'Members'],
  ['assets', FolderKanban, 'Shared assets'],
  ['governance', ShieldCheck, 'Governance'],
  ['audit', FileClock, 'Audit & exports'],
]
const roleColors = {
  owner:'#C4B5FD',
  admin:'#93C5FD',
  builder:'#86EFAC',
  viewer:'#A1A1AA',
}

function Label({ children }) {
  return (
    <div style={{ color:'#8B8FA3', fontSize:11, textTransform:'uppercase', marginBottom:6 }}>
      {children}
    </div>
  )
}

function Badge({ children, color = '#A78BFA' }) {
  return (
    <span style={{
      color,
      border:`1px solid ${color}55`,
      background:`${color}12`,
      borderRadius:99,
      padding:'3px 7px',
      fontSize:10,
      textTransform:'uppercase',
    }}>
      {children}
    </span>
  )
}

function Empty({ children }) {
  return (
    <div style={{ color:'#71717A', padding:'28px 8px', textAlign:'center', fontSize:13 }}>
      {children}
    </div>
  )
}

export default function Organizations() {
  const [organizations, setOrganizations] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState(null)
  const [resourceOptions, setResourceOptions] = useState({})
  const [audit, setAudit] = useState({ events:[], total:0, checkpoints:[] })
  const [activeTab, setActiveTab] = useState('overview')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite') || '')
  const [createdInvite, setCreatedInvite] = useState(null)
  const [createForm, setCreateForm] = useState({ name:'', description:'' })
  const [inviteForm, setInviteForm] = useState({
    email:'',
    role:'builder',
    expiry_days:7,
  })
  const [shareForm, setShareForm] = useState({
    resource_type:'agent',
    resource_id:'',
    access_level:'run',
  })
  const [changeReason, setChangeReason] = useState('Routine governed organization change')
  const [policyForm, setPolicyForm] = useState(null)
  const [auditFilters, setAuditFilters] = useState({ event_type:'', from:'', to:'' })

  const selectedSummary = organizations.find(item => item.id === selectedId) || null
  const role = detail?.membership?.role || selectedSummary?.membership?.role || 'viewer'
  const canBuild = ['owner', 'admin', 'builder'].includes(role)
  const canAdmin = ['owner', 'admin'].includes(role)
  const isOwner = role === 'owner'

  const loadOrganizations = useCallback(async (preferredId = '') => {
    const data = await getOrganizations()
    setOrganizations(data)
    setSelectedId(current => {
      const candidate = preferredId || current
      return data.some(item => item.id === candidate) ? candidate : data[0]?.id || ''
    })
    return data
  }, [])

  const loadDetail = useCallback(async id => {
    if (!id) {
      setDetail(null)
      return
    }
    const data = await getOrganization(id)
    setDetail(data)
    setPolicyForm({
      ...data.policy,
      max_estimated_cost_usd:data.policy.max_estimated_cost_usd ?? '',
      reason:'Update organization governance policy',
    })
  }, [])

  const loadAudit = useCallback(async id => {
    if (!id) return
    const filters = {
      ...auditFilters,
      from:auditFilters.from ? new Date(auditFilters.from).toISOString() : '',
      to:auditFilters.to ? new Date(`${auditFilters.to}T23:59:59`).toISOString() : '',
      limit:200,
    }
    setAudit(await getOrganizationAudit(id, filters))
  }, [auditFilters])

  const refresh = useCallback(async () => {
    try {
      await Promise.all([
        loadOrganizations(),
        getOrganizationResourceOptions().then(setResourceOptions),
      ])
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [loadOrganizations])

  useEffect(() => {
    const timer = setTimeout(refresh, 0)
    return () => clearTimeout(timer)
  }, [refresh])

  useEffect(() => {
    if (!selectedId) return
    const timer = setTimeout(() => {
      loadDetail(selectedId).catch(err => setError(err.message))
    }, 0)
    return () => clearTimeout(timer)
  }, [loadDetail, selectedId])

  useEffect(() => {
    if (activeTab !== 'audit' || !selectedId) return
    const timer = setTimeout(() => {
      loadAudit(selectedId).catch(err => setError(err.message))
    }, 0)
    return () => clearTimeout(timer)
  }, [activeTab, loadAudit, selectedId])

  const act = async (key, action, message, { reloadList = false, reloadAudit = false } = {}) => {
    setBusy(key)
    try {
      const result = await action()
      setNotice(message)
      setError('')
      if (reloadList) await loadOrganizations(selectedId)
      if (selectedId) await loadDetail(selectedId)
      if (reloadAudit && selectedId) await loadAudit(selectedId)
      return result
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setBusy('')
    }
  }

  const currentResourceOptions = resourceOptions[shareForm.resource_type] || []
  const pendingRequests = useMemo(
    () => (detail?.governance_requests || []).filter(item => item.status === 'pending'),
    [detail],
  )

  const create = async event => {
    event.preventDefault()
    setBusy('create')
    try {
      const result = await createOrganization(createForm)
      setCreateForm({ name:'', description:'' })
      setNotice('Organization workspace created')
      setError('')
      await loadOrganizations(result.organization.id)
      setSelectedId(result.organization.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const acceptInvite = () => act(
    'accept-invite',
    () => acceptOrganizationInvitation(inviteToken),
    'Invitation accepted',
    { reloadList:true },
  )

  const invite = async event => {
    event.preventDefault()
    const result = await act(
      'invite',
      () => inviteOrganizationMember(selectedId, inviteForm),
      'Invitation created. Copy it now; the raw token is shown only once.',
    )
    if (result) {
      setCreatedInvite(result)
      setInviteForm({ email:'', role:'builder', expiry_days:7 })
    }
  }

  const share = async event => {
    event.preventDefault()
    const result = await act(
      'share',
      () => shareOrganizationResource(selectedId, shareForm),
      'Resource shared with the organization',
      { reloadAudit:true },
    )
    if (result) setShareForm(current => ({ ...current, resource_id:'' }))
  }

  const savePolicy = async event => {
    event.preventDefault()
    const result = await act(
      'policy',
      () => updateOrganizationPolicy(selectedId, policyForm),
      'Policy saved or submitted for approval',
      { reloadAudit:true },
    )
    if (result?.governed) setNotice('Policy change is waiting for independent approval')
  }

  const exportCompliance = async format => {
    setBusy(`export-${format}`)
    try {
      const result = await downloadComplianceExport(selectedId, format, {
        from:auditFilters.from ? new Date(auditFilters.from).toISOString() : '',
        to:auditFilters.to ? new Date(`${auditFilters.to}T23:59:59`).toISOString() : '',
      })
      const url = URL.createObjectURL(result.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      link.click()
      URL.revokeObjectURL(url)
      setNotice(
        `Exported ${result.recordCount} audit records${result.sha256 ? ` · SHA-256 ${result.sha256.slice(0, 12)}…` : ''}`,
      )
      await loadDetail(selectedId)
      await loadAudit(selectedId)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div style={{ maxWidth:1180, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ margin:0, fontSize:25 }}>Organizations & governance</h1>
          <p style={{ color:'#8B8FA3', margin:'7px 0 0', fontSize:13 }}>
            Isolated team workspaces, controlled assets, approval-gated changes, and verifiable audit exports.
          </p>
        </div>
        <button style={secondary} onClick={refresh} disabled={Boolean(busy)}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {inviteToken && (
        <div style={{ ...panel, borderColor:'#6D28D9', marginBottom:14, display:'flex', justifyContent:'space-between', alignItems:'center', gap:16 }}>
          <div>
            <div style={{ fontWeight:600 }}>Organization invitation detected</div>
            <div style={{ color:'#A1A1AA', fontSize:12, marginTop:4 }}>
              Acceptance is restricted to the email address that was invited.
            </div>
          </div>
          <button style={primary} onClick={acceptInvite} disabled={busy === 'accept-invite'}>
            <Check size={14} /> Accept invitation
          </button>
        </div>
      )}

      {error && (
        <div style={{ color:'#FCA5A5', background:'#450A0A55', border:'1px solid #7F1D1D', borderRadius:9, padding:11, marginBottom:12 }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ color:'#86EFAC', background:'#052E1655', border:'1px solid #166534', borderRadius:9, padding:11, marginBottom:12 }}>
          {notice}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'260px minmax(0, 1fr)', gap:16 }}>
        <aside>
          <form style={{ ...panel, marginBottom:12 }} onSubmit={create}>
            <div style={{ display:'flex', alignItems:'center', gap:7, fontWeight:600, marginBottom:13 }}>
              <Plus size={15} /> New organization
            </div>
            <Label>Name</Label>
            <input
              style={{ ...field, marginBottom:9 }}
              value={createForm.name}
              onChange={event => setCreateForm({ ...createForm, name:event.target.value })}
              placeholder="Acme operations"
            />
            <Label>Description</Label>
            <textarea
              style={{ ...field, minHeight:64, resize:'vertical', marginBottom:10 }}
              value={createForm.description}
              onChange={event => setCreateForm({ ...createForm, description:event.target.value })}
              placeholder="What this team owns"
            />
            <button style={{ ...primary, width:'100%' }} disabled={busy === 'create'}>
              <Building2 size={14} /> Create workspace
            </button>
          </form>

          <div style={panel}>
            <Label>Your workspaces</Label>
            {!organizations.length && <Empty>No organizations yet.</Empty>}
            {organizations.map(organization => (
              <button
                key={organization.id}
                onClick={() => setSelectedId(organization.id)}
                style={{
                  width:'100%',
                  textAlign:'left',
                  border:organization.id === selectedId ? '1px solid #6D28D9' : '1px solid transparent',
                  background:organization.id === selectedId ? '#24153F' : 'transparent',
                  color:'#F4F4F5',
                  borderRadius:9,
                  padding:'10px 9px',
                  cursor:'pointer',
                  marginTop:5,
                }}
              >
                <div style={{ fontSize:13, fontWeight:600 }}>{organization.name}</div>
                <div style={{ color:'#71717A', fontSize:10, marginTop:4 }}>
                  {organization.membership.role} · {organization.member_count} members · {organization.resource_count} assets
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section>
          {!detail ? (
            <div style={panel}><Empty>Create or select an organization workspace.</Empty></div>
          ) : (
            <>
              <div style={{ ...panel, marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
                  <div>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <h2 style={{ margin:0, fontSize:20 }}>{detail.organization.name}</h2>
                      <Badge>{detail.organization.status}</Badge>
                      <Badge color={roleColors[role]}>{role}</Badge>
                    </div>
                    <div style={{ color:'#8B8FA3', fontSize:12, marginTop:6 }}>
                      {detail.organization.description || 'No description'} · /{detail.organization.slug}
                    </div>
                  </div>
                  {isOwner && (
                    <button
                      style={danger}
                      onClick={() => act(
                        'archive',
                        () => archiveOrganization(selectedId, detail.organization.status !== 'archived'),
                        detail.organization.status === 'archived' ? 'Organization restored' : 'Organization archived',
                        { reloadList:true, reloadAudit:true },
                      )}
                    >
                      <Archive size={14} />
                      {detail.organization.status === 'archived' ? 'Restore' : 'Archive'}
                    </button>
                  )}
                </div>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:16 }}>
                  {tabs.map(([id, Icon, label]) => (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      style={{
                        ...secondary,
                        background:activeTab === id ? '#35205C' : '#191C25',
                        color:activeTab === id ? '#DDD6FE' : '#9CA3AF',
                      }}
                    >
                      <Icon size={13} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === 'overview' && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12 }}>
                  {[
                    ['Active members', detail.members.filter(item => item.status === 'active').length],
                    ['Shared assets', detail.resources.length],
                    ['Pending approvals', pendingRequests.length],
                  ].map(([label, value]) => (
                    <div key={label} style={panel}>
                      <Label>{label}</Label>
                      <div style={{ fontSize:27, marginTop:10 }}>{value}</div>
                    </div>
                  ))}
                  <div style={{ ...panel, gridColumn:'1 / -1' }}>
                    <h3 style={{ margin:'0 0 12px', fontSize:15 }}>Tenant boundary</h3>
                    <div style={{ color:'#A1A1AA', fontSize:13, lineHeight:1.7 }}>
                      Every organization request is authorized through active membership and role rank.
                      Shared resources keep their original owner, are exposed only as bounded metadata,
                      and can be cloned only when the share explicitly grants run or edit access.
                      Organization execution policies are enforced before shared agents, workflows,
                      chains, evaluations, or multi-agent systems enter execution.
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'members' && (
                <div style={{ display:'grid', gap:12 }}>
                  {canAdmin && (
                    <form style={panel} onSubmit={invite}>
                      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:13 }}>
                        <UserPlus size={15} />
                        <h3 style={{ margin:0, fontSize:15 }}>Invite teammate</h3>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 100px auto', gap:8 }}>
                        <input
                          style={field}
                          type="email"
                          value={inviteForm.email}
                          onChange={event => setInviteForm({ ...inviteForm, email:event.target.value })}
                          placeholder="teammate@example.com"
                          required
                        />
                        <select
                          style={field}
                          value={inviteForm.role}
                          onChange={event => setInviteForm({ ...inviteForm, role:event.target.value })}
                        >
                          {isOwner && <option value="admin">Admin</option>}
                          <option value="builder">Builder</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <input
                          style={field}
                          type="number"
                          min="1"
                          max="30"
                          value={inviteForm.expiry_days}
                          onChange={event => setInviteForm({ ...inviteForm, expiry_days:Number(event.target.value) })}
                          title="Expiry days"
                        />
                        <button style={primary} disabled={busy === 'invite'}>
                          <KeyRound size={14} /> Invite
                        </button>
                      </div>
                    </form>
                  )}

                  {createdInvite && (
                    <div style={{ ...panel, borderColor:'#166534' }}>
                      <Label>One-time invitation link</Label>
                      <div style={{ display:'flex', gap:8 }}>
                        <input
                          style={field}
                          readOnly
                          value={`${window.location.origin}${createdInvite.acceptance_path}`}
                        />
                        <button
                          style={secondary}
                          onClick={() => navigator.clipboard.writeText(
                            `${window.location.origin}${createdInvite.acceptance_path}`,
                          )}
                        >
                          <Clipboard size={14} /> Copy
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={panel}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                      <h3 style={{ margin:0, fontSize:15 }}>Members</h3>
                      <span style={{ color:'#71717A', fontSize:11 }}>
                        owner &gt; admin &gt; builder &gt; viewer
                      </span>
                    </div>
                    <div style={{ display:'grid', gap:8 }}>
                      {detail.members.map(member => (
                        <div
                          key={member.id}
                          style={{
                            background:'#0D0F15',
                            border:'1px solid #242735',
                            borderRadius:9,
                            padding:11,
                            display:'grid',
                            gridTemplateColumns:'1fr 110px auto',
                            gap:8,
                            alignItems:'center',
                          }}
                        >
                          <div>
                            <div style={{ fontSize:13, fontWeight:600 }}>
                              {member.profile?.full_name || member.profile?.username || member.user_id.slice(0, 8)}
                            </div>
                            <div style={{ color:'#71717A', fontSize:10, marginTop:3 }}>
                              Joined {new Date(member.joined_at).toLocaleDateString()}
                            </div>
                          </div>
                          {isOwner && member.role !== 'owner' ? (
                            <select
                              style={field}
                              value={member.role}
                              onChange={event => act(
                                `role-${member.id}`,
                                () => updateOrganizationMember(selectedId, member.user_id, {
                                  role:event.target.value,
                                  reason:changeReason,
                                }),
                                'Role changed or submitted for approval',
                                { reloadAudit:true },
                              )}
                            >
                              <option value="admin">Admin</option>
                              <option value="builder">Builder</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          ) : (
                            <Badge color={roleColors[member.role]}>{member.role}</Badge>
                          )}
                          {canAdmin && member.role !== 'owner' && (
                            <button
                              style={danger}
                              onClick={() => act(
                                `remove-${member.id}`,
                                () => removeOrganizationMember(selectedId, member.user_id, changeReason),
                                'Removal completed or submitted for approval',
                                { reloadAudit:true },
                              )}
                            >
                              <X size={13} /> Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {canAdmin && (
                    <div style={panel}>
                      <h3 style={{ margin:'0 0 10px', fontSize:15 }}>Pending invitations</h3>
                      {!detail.invitations.filter(item => !item.accepted_at && !item.revoked_at).length && (
                        <Empty>No pending invitations.</Empty>
                      )}
                      {detail.invitations.filter(item => !item.accepted_at && !item.revoked_at).map(invitation => (
                        <div key={invitation.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid #222532' }}>
                          <div>
                            <div style={{ fontSize:12 }}>{invitation.email}</div>
                            <div style={{ color:'#71717A', fontSize:10, marginTop:3 }}>
                              {invitation.role} · expires {new Date(invitation.expires_at).toLocaleString()}
                            </div>
                          </div>
                          <button
                            style={danger}
                            onClick={() => act(
                              `revoke-${invitation.id}`,
                              () => revokeOrganizationInvitation(selectedId, invitation.id),
                              'Invitation revoked',
                              { reloadAudit:true },
                            )}
                          >
                            Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'assets' && (
                <div style={{ display:'grid', gap:12 }}>
                  {canBuild && (
                    <form style={panel} onSubmit={share}>
                      <h3 style={{ margin:'0 0 13px', fontSize:15 }}>Share an owned resource</h3>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr 1fr auto', gap:8 }}>
                        <select
                          style={field}
                          value={shareForm.resource_type}
                          onChange={event => setShareForm({
                            ...shareForm,
                            resource_type:event.target.value,
                            resource_id:'',
                          })}
                        >
                          <option value="agent">Agent</option>
                          <option value="workflow">Workflow</option>
                          <option value="chain">Chain</option>
                          <option value="knowledge_base">Knowledge base</option>
                          <option value="multi_agent">Multi-agent</option>
                          <option value="evaluation_suite">Evaluation suite</option>
                        </select>
                        <select
                          style={field}
                          value={shareForm.resource_id}
                          onChange={event => setShareForm({ ...shareForm, resource_id:event.target.value })}
                          required
                        >
                          <option value="">Choose owned resource</option>
                          {currentResourceOptions.map(resource => (
                            <option key={resource.id} value={resource.id}>{resource.name}</option>
                          ))}
                        </select>
                        <select
                          style={field}
                          value={shareForm.access_level}
                          onChange={event => setShareForm({ ...shareForm, access_level:event.target.value })}
                        >
                          <option value="view">View only</option>
                          <option value="run">Reuse / run</option>
                          <option value="edit">Edit copy</option>
                        </select>
                        <button style={primary} disabled={busy === 'share'}>
                          <Plus size={14} /> Share
                        </button>
                      </div>
                    </form>
                  )}
                  <div style={panel}>
                    <h3 style={{ margin:'0 0 12px', fontSize:15 }}>Organization asset inventory</h3>
                    {!detail.resources.length && <Empty>No resources shared yet.</Empty>}
                    <div style={{ display:'grid', gap:8 }}>
                      {detail.resources.map(shareItem => (
                        <div
                          key={shareItem.id}
                          style={{
                            background:'#0D0F15',
                            border:'1px solid #242735',
                            borderRadius:9,
                            padding:11,
                            display:'flex',
                            justifyContent:'space-between',
                            alignItems:'center',
                            gap:10,
                          }}
                        >
                          <div>
                            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                              <span style={{ fontWeight:600, fontSize:13 }}>
                                {shareItem.resource?.name || 'Unavailable resource'}
                              </span>
                              <Badge>{shareItem.resource_type.replace('_', ' ')}</Badge>
                              <Badge color="#86EFAC">{shareItem.access_level}</Badge>
                            </div>
                            <div style={{ color:'#71717A', fontSize:10, marginTop:4 }}>
                              Owner {shareItem.resource?.user_id?.slice(0, 8) || 'removed'} · shared {new Date(shareItem.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:7 }}>
                            {['agent', 'workflow'].includes(shareItem.resource_type) && shareItem.access_level !== 'view' && canBuild && (
                              <button
                                style={secondary}
                                onClick={() => act(
                                  `clone-${shareItem.id}`,
                                  () => cloneOrganizationResource(selectedId, shareItem.id),
                                  'Shared resource cloned into your drafts',
                                  { reloadAudit:true },
                                )}
                              >
                                <Clipboard size={13} /> Clone draft
                              </button>
                            )}
                            {canBuild && (
                              <button
                                style={danger}
                                onClick={() => act(
                                  `unshare-${shareItem.id}`,
                                  () => unshareOrganizationResource(selectedId, shareItem.id, changeReason),
                                  'Removal completed or submitted for approval',
                                  { reloadAudit:true },
                                )}
                              >
                                <X size={13} /> Unshare
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'governance' && policyForm && (
                <div style={{ display:'grid', gap:12 }}>
                  {canAdmin && (
                    <form style={panel} onSubmit={savePolicy}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                        <ShieldCheck size={16} />
                        <h3 style={{ margin:0, fontSize:15 }}>Execution and compliance policy</h3>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:11 }}>
                        <label style={{ color:'#D4D4D8', fontSize:12 }}>
                          <input
                            type="checkbox"
                            checked={policyForm.execution_enabled}
                            onChange={event => setPolicyForm({ ...policyForm, execution_enabled:event.target.checked })}
                            style={{ marginRight:7 }}
                          />
                          Shared execution enabled
                        </label>
                        <label style={{ color:'#D4D4D8', fontSize:12 }}>
                          <input
                            type="checkbox"
                            checked={policyForm.immutable_audit}
                            onChange={event => setPolicyForm({ ...policyForm, immutable_audit:event.target.checked })}
                            style={{ marginRight:7 }}
                          />
                          Immutable audit retention
                        </label>
                        <label style={{ color:'#D4D4D8', fontSize:12 }}>
                          <input
                            type="checkbox"
                            checked={policyForm.compliance_export_enabled}
                            onChange={event => setPolicyForm({ ...policyForm, compliance_export_enabled:event.target.checked })}
                            style={{ marginRight:7 }}
                          />
                          Compliance exports enabled
                        </label>
                        <div>
                          <Label>Max model calls / run</Label>
                          <input
                            style={field}
                            type="number"
                            min="1"
                            max="10000"
                            value={policyForm.max_model_calls_per_run}
                            onChange={event => setPolicyForm({ ...policyForm, max_model_calls_per_run:Number(event.target.value) })}
                          />
                        </div>
                        <div>
                          <Label>Max estimated cost / run</Label>
                          <input
                            style={field}
                            type="number"
                            min="0.0001"
                            step="0.0001"
                            value={policyForm.max_estimated_cost_usd}
                            onChange={event => setPolicyForm({ ...policyForm, max_estimated_cost_usd:event.target.value })}
                            placeholder="No additional limit"
                          />
                        </div>
                        <div>
                          <Label>Audit retention days</Label>
                          <input
                            style={field}
                            type="number"
                            min="30"
                            max="3650"
                            value={policyForm.audit_retention_days}
                            onChange={event => setPolicyForm({ ...policyForm, audit_retention_days:Number(event.target.value) })}
                          />
                        </div>
                        <div>
                          <Label>Approval mode</Label>
                          <select
                            style={field}
                            value={policyForm.approval_mode}
                            onChange={event => setPolicyForm({ ...policyForm, approval_mode:event.target.value })}
                          >
                            <option value="none">No change approvals</option>
                            <option value="sensitive">Sensitive changes</option>
                            <option value="all_changes">All governed changes</option>
                          </select>
                        </div>
                        <div>
                          <Label>Independent approvers</Label>
                          <input
                            style={field}
                            type="number"
                            min="1"
                            max="5"
                            value={policyForm.minimum_approvers}
                            onChange={event => setPolicyForm({ ...policyForm, minimum_approvers:Number(event.target.value) })}
                          />
                        </div>
                        <div>
                          <Label>Allowed models</Label>
                          <div style={{ display:'flex', gap:9, minHeight:38, alignItems:'center' }}>
                            {[
                              'claude-sonnet-4-6',
                              'claude-opus-4-6',
                              'gpt-5.6-sol',
                              'gpt-5.6-terra',
                              'gpt-5.6-luna',
                              'gemini-3.5-flash',
                            ].map(model => (
                              <label key={model} style={{ fontSize:10, color:'#A1A1AA' }}>
                                <input
                                  type="checkbox"
                                  checked={policyForm.allowed_models.includes(model)}
                                  onChange={event => setPolicyForm({
                                    ...policyForm,
                                    allowed_models:event.target.checked
                                      ? [...new Set([...policyForm.allowed_models, model])]
                                      : policyForm.allowed_models.filter(item => item !== model),
                                  })}
                                /> {model}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, marginTop:12 }}>
                        <input
                          style={field}
                          value={policyForm.reason}
                          onChange={event => setPolicyForm({ ...policyForm, reason:event.target.value })}
                          placeholder="Reason for policy change"
                        />
                        <button style={primary} disabled={busy === 'policy'}>
                          <ShieldCheck size={14} /> Save governed policy
                        </button>
                      </div>
                    </form>
                  )}

                  <div style={panel}>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:12 }}>
                      <h3 style={{ margin:0, fontSize:15 }}>Governance change queue</h3>
                      <span style={{ color:'#71717A', fontSize:11 }}>
                        Requesters cannot approve their own changes
                      </span>
                    </div>
                    {!detail.governance_requests.length && <Empty>No governed changes yet.</Empty>}
                    <div style={{ display:'grid', gap:8 }}>
                      {detail.governance_requests.map(requestItem => (
                        <div key={requestItem.id} style={{ background:'#0D0F15', border:'1px solid #242735', borderRadius:9, padding:11 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
                            <div>
                              <div style={{ display:'flex', gap:7, alignItems:'center' }}>
                                <span style={{ fontWeight:600, fontSize:12 }}>
                                  {requestItem.change_type.replace('_', ' ')}
                                </span>
                                <Badge color={requestItem.status === 'pending' ? '#FBBF24' : '#A1A1AA'}>
                                  {requestItem.status}
                                </Badge>
                              </div>
                              <div style={{ color:'#A1A1AA', fontSize:11, marginTop:5 }}>{requestItem.reason}</div>
                              <div style={{ color:'#71717A', fontSize:10, marginTop:4 }}>
                                {(requestItem.decisions || []).filter(item => item.decision === 'approve').length}
                                /{requestItem.required_approvals} approvals · expires {new Date(requestItem.expires_at).toLocaleString()}
                              </div>
                            </div>
                            {requestItem.status === 'pending' && (
                              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                                {canAdmin && (
                                  <>
                                    <button
                                      style={primary}
                                      onClick={() => act(
                                        `approve-${requestItem.id}`,
                                        () => decideGovernanceChange(selectedId, requestItem.id, 'approve', 'Approved in governance console'),
                                        'Governance decision recorded',
                                        { reloadAudit:true },
                                      )}
                                    >
                                      <Check size={13} /> Approve
                                    </button>
                                    <button
                                      style={danger}
                                      onClick={() => act(
                                        `reject-${requestItem.id}`,
                                        () => decideGovernanceChange(selectedId, requestItem.id, 'reject', 'Rejected in governance console'),
                                        'Governance request rejected',
                                        { reloadAudit:true },
                                      )}
                                    >
                                      <X size={13} /> Reject
                                    </button>
                                  </>
                                )}
                                <button
                                  style={secondary}
                                  onClick={() => act(
                                    `cancel-${requestItem.id}`,
                                    () => cancelGovernanceChange(selectedId, requestItem.id),
                                    'Governance request cancelled',
                                    { reloadAudit:true },
                                  )}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={panel}>
                    <Label>Reason used for member and asset changes</Label>
                    <input
                      style={field}
                      value={changeReason}
                      onChange={event => setChangeReason(event.target.value)}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'audit' && (
                <div style={{ display:'grid', gap:12 }}>
                  <div style={panel}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 150px 150px auto auto auto', gap:8 }}>
                      <input
                        style={field}
                        value={auditFilters.event_type}
                        onChange={event => setAuditFilters({ ...auditFilters, event_type:event.target.value })}
                        placeholder="Exact event type"
                      />
                      <input
                        style={field}
                        type="date"
                        value={auditFilters.from}
                        onChange={event => setAuditFilters({ ...auditFilters, from:event.target.value })}
                      />
                      <input
                        style={field}
                        type="date"
                        value={auditFilters.to}
                        onChange={event => setAuditFilters({ ...auditFilters, to:event.target.value })}
                      />
                      <button style={secondary} onClick={() => loadAudit(selectedId)}>
                        <RefreshCw size={13} /> Filter
                      </button>
                      {canAdmin && detail.policy.compliance_export_enabled && (
                        <>
                          <button style={secondary} onClick={() => exportCompliance('json')}>
                            <Download size={13} /> JSON
                          </button>
                          <button style={secondary} onClick={() => exportCompliance('csv')}>
                            <Download size={13} /> CSV
                          </button>
                        </>
                      )}
                    </div>
                    <div style={{ color:'#71717A', fontSize:10, marginTop:9 }}>
                      {audit.total} events · newest first · export hashes use SHA-256
                    </div>
                  </div>

                  <div style={panel}>
                    <h3 style={{ margin:'0 0 12px', fontSize:15 }}>Tamper-evident event chain</h3>
                    {!audit.events.length && <Empty>No matching audit events.</Empty>}
                    <div style={{ display:'grid', gap:7 }}>
                      {audit.events.map(event => (
                        <div key={event.id} style={{ background:'#0D0F15', border:'1px solid #242735', borderRadius:9, padding:10 }}>
                          <div style={{ display:'grid', gridTemplateColumns:'70px 1fr 180px', gap:8, alignItems:'center' }}>
                            <Badge>#{event.sequence_number}</Badge>
                            <div>
                              <div style={{ fontWeight:600, fontSize:12 }}>{event.event_type}</div>
                              <div style={{ color:'#71717A', fontSize:10, marginTop:3 }}>
                                {event.target_type || 'organization'} {event.target_id?.slice(0, 8) || ''}
                              </div>
                            </div>
                            <div style={{ color:'#A1A1AA', fontSize:10, textAlign:'right' }}>
                              {new Date(event.occurred_at).toLocaleString()}
                              <div title={event.event_hash} style={{ color:'#6B7280', marginTop:3 }}>
                                hash {event.event_hash.slice(0, 14)}…
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!!audit.checkpoints.length && (
                    <div style={panel}>
                      <h3 style={{ margin:'0 0 10px', fontSize:15 }}>Retention checkpoints</h3>
                      {audit.checkpoints.map(checkpoint => (
                        <div key={checkpoint.id} style={{ color:'#A1A1AA', fontSize:11, padding:'7px 0' }}>
                          Deleted through sequence {checkpoint.deleted_through_sequence} ·
                          {' '}{checkpoint.events_deleted} events · terminal hash {checkpoint.terminal_hash.slice(0, 14)}…
                        </div>
                      ))}
                    </div>
                  )}

                  {canAdmin && (
                    <div style={panel}>
                      <h3 style={{ margin:'0 0 10px', fontSize:15 }}>Export ledger</h3>
                      {!detail.compliance_exports.length && <Empty>No compliance exports yet.</Empty>}
                      {detail.compliance_exports.map(item => (
                        <div key={item.id} style={{ display:'flex', justifyContent:'space-between', color:'#A1A1AA', fontSize:11, padding:'7px 0' }}>
                          <span>{item.export_format.toUpperCase()} · {item.record_count} records · {item.status}</span>
                          <span>{item.content_sha256?.slice(0, 14)}… · {new Date(item.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
