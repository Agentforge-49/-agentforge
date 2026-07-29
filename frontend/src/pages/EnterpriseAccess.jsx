import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, Clipboard, Globe2, KeyRound, LockKeyhole, RefreshCw,
  ShieldCheck, UserCheck, UserMinus, X,
} from 'lucide-react'

import {
  addOrganizationDomain,
  cancelAccessReview,
  createAccessReview,
  decideAccessReviewItem,
  getEnterpriseAccess,
  getOrganizations,
  removeOrganizationDomain,
  rotateScimToken,
  updateIdentitySettings,
  verifyOrganizationDomain,
} from '../lib/api'

const panel = {
  background:'#13151C', border:'1px solid #252837', borderRadius:14, padding:18,
}
const field = {
  width:'100%', boxSizing:'border-box', color:'#F4F4F5', background:'#0D0F15',
  border:'1px solid #2B2E3D', borderRadius:8, padding:'9px 11px',
}
const button = {
  border:0, borderRadius:8, padding:'9px 13px', background:'#7C3AED',
  color:'white', cursor:'pointer', display:'inline-flex', alignItems:'center',
  justifyContent:'center', gap:7,
}
const quietButton = { ...button, background:'#252837', color:'#D4D4D8' }
const label = { display:'block', color:'#8B8FA3', fontSize:11, margin:'10px 0 5px' }

const defaultSettings = {
  protocol:'oidc', provider_name:'', issuer_url:'', metadata_url:'', client_id:'',
  sso_enabled:false, sso_enforced:false, jit_provisioning:false, default_role:'viewer',
  require_mfa:false, session_max_minutes:720, idle_timeout_minutes:60, scim_enabled:false,
}

export default function EnterpriseAccess() {
  const [organizations, setOrganizations] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [data, setData] = useState(null)
  const [settings, setSettings] = useState(defaultSettings)
  const [domain, setDomain] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [scimToken, setScimToken] = useState('')
  const [review, setReview] = useState({ name:'Quarterly access review', due_days:14, notes:'' })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const admins = useMemo(() => organizations.filter(item => (
    ['owner', 'admin'].includes(item.membership?.role)
  )), [organizations])

  const loadOrganizations = useCallback(async () => {
    try {
      const items = await getOrganizations()
      setOrganizations(items)
      const eligible = items.filter(item => ['owner', 'admin'].includes(item.membership?.role))
      setSelectedId(current => eligible.some(item => item.id === current)
        ? current : eligible[0]?.id || '')
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const load = useCallback(async () => {
    if (!selectedId) {
      setData(null)
      return
    }
    try {
      const result = await getEnterpriseAccess(selectedId)
      setData(result)
      setSettings({ ...defaultSettings, ...(result.settings || {}) })
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [selectedId])

  useEffect(() => {
    const timer = setTimeout(loadOrganizations, 0)
    return () => clearTimeout(timer)
  }, [loadOrganizations])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const act = async (key, action, message, after = load) => {
    setBusy(key)
    try {
      const result = await action()
      setError('')
      setNotice(message)
      await after()
      return result
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setBusy('')
    }
  }

  const addDomain = async event => {
    event.preventDefault()
    const result = await act('domain', () => addOrganizationDomain(selectedId, domain),
      'Domain challenge created.')
    if (result) {
      setChallenge(result.verification)
      setDomain('')
    }
  }

  const verifyDomain = async item => {
    const token = challenge?.token || window.prompt('Paste the domain verification token')
    if (!token) return
    await act(`verify-${item.id}`, () => verifyOrganizationDomain(selectedId, item.id, token),
      'Domain verified through DNS.')
  }

  const saveSettings = event => {
    event.preventDefault()
    act('settings', () => updateIdentitySettings(selectedId, {
      ...settings,
      session_max_minutes:Number(settings.session_max_minutes),
      idle_timeout_minutes:Number(settings.idle_timeout_minutes),
    }), 'Identity policy saved.')
  }

  const rotateToken = async () => {
    const result = await act('scim', () => rotateScimToken(selectedId),
      'SCIM token rotated. Copy it now.')
    if (result) {
      setScimToken(result.token)
      setSettings(current => ({ ...current, scim_enabled:true }))
    }
  }

  const startReview = event => {
    event.preventDefault()
    act('review', () => createAccessReview(selectedId, {
      ...review,
      due_days:Number(review.due_days),
    }), 'Access review started.')
  }

  const decide = (reviewId, item, decision) => {
    const recommendedRole = decision === 'change'
      ? window.prompt('New role: admin, builder, or viewer', 'viewer') : null
    if (decision === 'change' && !recommendedRole) return
    act(`item-${item.id}`, () => decideAccessReviewItem(selectedId, reviewId, item.id, {
      decision,
      recommended_role:recommendedRole,
      note:'Reviewed in enterprise access console',
    }), `Member access marked ${decision}.`)
  }

  return (
    <div style={{ maxWidth:1220, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'end', gap:15, marginBottom:20 }}>
        <div>
          <h1 style={{ margin:'0 0 5px', fontSize:25 }}>Enterprise identity & access</h1>
          <p style={{ margin:0, color:'#8B8FA3', fontSize:13 }}>
            Verified domains, SSO configuration, SCIM provisioning, session policy, and enforceable access reviews.
          </p>
        </div>
        <button style={quietButton} onClick={() => { loadOrganizations(); load() }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <Message color="#FCA5A5" border="#7F1D1D">{error}</Message>}
      {notice && <Message color="#86EFAC" border="#14532D">
        {notice}<button onClick={() => setNotice('')} style={{ border:0, background:'none', color:'#86EFAC' }}><X size={14} /></button>
      </Message>}

      <div style={{ ...panel, marginBottom:14, display:'flex', alignItems:'center', gap:12 }}>
        <BuildingLabel />
        <select style={{ ...field, maxWidth:420 }} value={selectedId}
          onChange={event => { setSelectedId(event.target.value); setChallenge(null); setScimToken('') }}>
          {!admins.length && <option value="">No admin workspaces available</option>}
          {admins.map(item => (
            <option key={item.id} value={item.id}>
              {item.name} — {item.membership.role}
            </option>
          ))}
        </select>
        <span style={{ color:'#71717A', fontSize:11 }}>
          Owner access is required to change identity policy.
        </span>
      </div>

      {!selectedId && <div style={panel}>Create an organization or ask for admin access first.</div>}
      {selectedId && !data && <div style={panel}>Loading enterprise controls…</div>}

      {data && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            <div style={panel}>
              <SectionTitle icon={Globe2} title="Verified domains" />
              <p style={muted}>Ownership is proven through a DNS TXT challenge. Tokens are stored only as hashes.</p>
              <form onSubmit={addDomain} style={{ display:'flex', gap:8 }}>
                <input style={field} value={domain} placeholder="example.com"
                  onChange={event => setDomain(event.target.value)} />
                <button style={button} disabled={busy === 'domain'}>Add</button>
              </form>
              {challenge && (
                <div style={secretBox}>
                  <div style={{ color:'#C4B5FD', fontSize:11 }}>Add this DNS TXT record, then verify:</div>
                  <CodeCopy value={`${challenge.record_name}\n${challenge.record_value}`} />
                </div>
              )}
              <div style={{ marginTop:12 }}>
                {!data.domains.length && <Empty>No domains registered.</Empty>}
                {data.domains.map(item => (
                  <div key={item.id} style={row}>
                    <div>
                      <div style={{ fontSize:13 }}>{item.domain}</div>
                      <div style={{ color:item.status === 'verified' ? '#86EFAC' : '#FBBF24', fontSize:10 }}>
                        {item.status} · DNS TXT
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      {item.status !== 'verified' && (
                        <button style={quietButton} onClick={() => verifyDomain(item)}
                          disabled={busy === `verify-${item.id}`}>Verify</button>
                      )}
                      <button style={{ ...quietButton, color:'#FCA5A5' }}
                        onClick={() => act(`remove-${item.id}`,
                          () => removeOrganizationDomain(selectedId, item.id), 'Domain removed.')}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={panel}>
              <SectionTitle icon={KeyRound} title="SCIM 2.0 provisioning" />
              <p style={muted}>
                Provision directory identities through a hashed bearer token. Admin and owner roles cannot be assigned through SCIM.
              </p>
              <div style={secretBox}>
                <div style={{ color:'#8B8FA3', fontSize:10 }}>SCIM base URL</div>
                <code style={{ color:'#D8B4FE', fontSize:11, wordBreak:'break-all' }}>
                  {`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/enterprise/scim/v2/${selectedId}`}
                </code>
              </div>
              <button style={button} onClick={rotateToken} disabled={busy === 'scim'}>
                <KeyRound size={14} /> {data.settings?.scim_token_last_four ? 'Rotate token' : 'Create token'}
              </button>
              {scimToken && (
                <div style={secretBox}>
                  <div style={{ color:'#FBBF24', fontSize:11 }}>Shown once — copy this SCIM bearer token now.</div>
                  <CodeCopy value={scimToken} />
                </div>
              )}
              <div style={{ marginTop:13, color:'#8B8FA3', fontSize:11 }}>
                Directory users: {data.directory_users.length} · token ending {data.settings?.scim_token_last_four || 'not created'}
              </div>
            </div>
          </div>

          <form onSubmit={saveSettings} style={{ ...panel, marginBottom:14 }}>
            <SectionTitle icon={LockKeyhole} title="SSO and session policy" />
            {!data.capabilities.native_sso_login && (
              <div style={{ ...secretBox, color:'#FBBF24' }}>
                Configuration and enforcement gates are ready. Native SAML/OIDC login activation remains disabled until provider secrets are connected.
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
              <Field label="Protocol">
                <select style={field} value={settings.protocol}
                  onChange={event => setSettings({ ...settings, protocol:event.target.value })}>
                  <option value="oidc">OIDC</option><option value="saml">SAML</option>
                </select>
              </Field>
              <Field label="Provider name">
                <input style={field} value={settings.provider_name || ''} placeholder="Okta, Entra ID…"
                  onChange={event => setSettings({ ...settings, provider_name:event.target.value })} />
              </Field>
              <Field label="Client ID">
                <input style={field} value={settings.client_id || ''}
                  onChange={event => setSettings({ ...settings, client_id:event.target.value })} />
              </Field>
              <Field label="Issuer URL">
                <input style={field} value={settings.issuer_url || ''} placeholder="https://…"
                  onChange={event => setSettings({ ...settings, issuer_url:event.target.value })} />
              </Field>
              <Field label="Metadata URL">
                <input style={field} value={settings.metadata_url || ''} placeholder="https://…"
                  onChange={event => setSettings({ ...settings, metadata_url:event.target.value })} />
              </Field>
              <Field label="Default JIT role">
                <select style={field} value={settings.default_role}
                  onChange={event => setSettings({ ...settings, default_role:event.target.value })}>
                  <option value="viewer">Viewer</option><option value="builder">Builder</option>
                </select>
              </Field>
              <Field label="Maximum session (minutes)">
                <input style={field} type="number" min="15" max="43200" value={settings.session_max_minutes}
                  onChange={event => setSettings({ ...settings, session_max_minutes:event.target.value })} />
              </Field>
              <Field label="Idle timeout (minutes)">
                <input style={field} type="number" min="5" max="1440" value={settings.idle_timeout_minutes}
                  onChange={event => setSettings({ ...settings, idle_timeout_minutes:event.target.value })} />
              </Field>
              <div style={{ display:'grid', gap:7, paddingTop:20 }}>
                {[
                  ['sso_enabled', 'Enable SSO configuration'],
                  ['sso_enforced', 'Enforce SSO for verified domains'],
                  ['jit_provisioning', 'Allow JIT provisioning'],
                  ['require_mfa', 'Require MFA claim'],
                  ['scim_enabled', 'Enable SCIM endpoint'],
                ].map(([key, text]) => (
                  <label key={key} style={{ color:'#C4B5FD', fontSize:11 }}>
                    <input type="checkbox" checked={settings[key] === true}
                      onChange={event => setSettings({ ...settings, [key]:event.target.checked })} /> {text}
                  </label>
                ))}
              </div>
            </div>
            <button style={{ ...button, marginTop:13 }} disabled={busy === 'settings'}>
              <ShieldCheck size={14} /> Save identity policy
            </button>
          </form>

          <div style={panel}>
            <SectionTitle icon={UserCheck} title="Access reviews" />
            <form onSubmit={startReview}
              style={{ display:'grid', gridTemplateColumns:'2fr 100px 2fr auto', gap:8, alignItems:'end' }}>
              <Field label="Review name">
                <input style={field} value={review.name}
                  onChange={event => setReview({ ...review, name:event.target.value })} />
              </Field>
              <Field label="Due in days">
                <input style={field} type="number" min="1" max="365" value={review.due_days}
                  onChange={event => setReview({ ...review, due_days:event.target.value })} />
              </Field>
              <Field label="Notes">
                <input style={field} value={review.notes}
                  onChange={event => setReview({ ...review, notes:event.target.value })} />
              </Field>
              <button style={button} disabled={busy === 'review'}>Start review</button>
            </form>
            <div style={{ marginTop:14 }}>
              {!data.access_reviews.length && <Empty>No access reviews yet.</Empty>}
              {data.access_reviews.map(item => (
                <div key={item.id} style={{ ...secretBox, padding:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
                    <div>
                      <strong style={{ fontSize:13 }}>{item.name}</strong>
                      <div style={{ color:'#71717A', fontSize:10 }}>
                        {item.status} · due {new Date(item.due_at).toLocaleDateString()} · {item.items.length} members
                      </div>
                    </div>
                    {item.status === 'open' && (
                      <button style={quietButton}
                        onClick={() => act(`cancel-${item.id}`, () => cancelAccessReview(selectedId, item.id), 'Review cancelled.')}>
                        Cancel
                      </button>
                    )}
                  </div>
                  {item.items.map(reviewItem => (
                    <div key={reviewItem.id} style={{ ...row, padding:'9px 0' }}>
                      <div>
                        <div style={{ fontSize:12 }}>
                          {reviewItem.profile?.full_name || reviewItem.profile?.username || reviewItem.member_user_id.slice(0, 8)}
                        </div>
                        <div style={{ color:'#71717A', fontSize:10 }}>
                          {reviewItem.snapshot_role} → {reviewItem.decision}
                          {reviewItem.recommended_role ? ` (${reviewItem.recommended_role})` : ''}
                        </div>
                      </div>
                      {item.status === 'open' && reviewItem.decision === 'pending' && (
                        <div style={{ display:'flex', gap:5 }}>
                          <button style={quietButton} onClick={() => decide(item.id, reviewItem, 'retain')}>
                            <CheckCircle2 size={13} /> Retain
                          </button>
                          {reviewItem.snapshot_role !== 'owner' && (
                            <>
                              <button style={quietButton} onClick={() => decide(item.id, reviewItem, 'change')}>Change</button>
                              <button style={{ ...quietButton, color:'#FCA5A5' }}
                                onClick={() => decide(item.id, reviewItem, 'revoke')}>
                                <UserMinus size={13} /> Revoke
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function BuildingLabel() {
  return <div style={{ color:'#C4B5FD', fontSize:12, fontWeight:600 }}>Workspace</div>
}
function SectionTitle({ icon:Icon, title }) {
  return <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
    <Icon size={17} color="#A78BFA" /><h2 style={{ margin:0, fontSize:16 }}>{title}</h2>
  </div>
}
function Field({ label:fieldLabel, children }) {
  return <label><span style={label}>{fieldLabel}</span>{children}</label>
}
function Empty({ children }) {
  return <div style={{ color:'#71717A', fontSize:12, padding:'10px 0' }}>{children}</div>
}
function Message({ color, border, children }) {
  return <div style={{ ...panel, borderColor:border, color, marginBottom:13,
    display:'flex', justifyContent:'space-between', gap:10 }}>{children}</div>
}
function CodeCopy({ value }) {
  return <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:6 }}>
    <code style={{ flex:1, color:'#D8B4FE', whiteSpace:'pre-wrap', wordBreak:'break-all', fontSize:10 }}>{value}</code>
    <button type="button" style={quietButton} onClick={() => navigator.clipboard?.writeText(value)}>
      <Clipboard size={13} />
    </button>
  </div>
}
const muted = { color:'#8B8FA3', fontSize:11, lineHeight:1.55 }
const secretBox = {
  background:'#0D0F15', border:'1px solid #252837', borderRadius:9, padding:10, margin:'10px 0',
}
const row = {
  display:'flex', justifyContent:'space-between', alignItems:'center', gap:10,
  borderBottom:'1px solid #20232F', padding:'10px 0',
}
