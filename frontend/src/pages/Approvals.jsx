import { useEffect, useState } from 'react'
import { Check, Clock3, Pencil, ShieldCheck, X } from 'lucide-react'

import { decideApproval, getApprovals } from '../lib/api'
import OperationsHeader from '../components/OperationsHeader'

const STATUS = {
  pending:'#FCD34D',
  approved:'#34D399',
  edited:'#60A5FA',
  rejected:'#F87171',
  expired:'#9CA3AF',
  cancelled:'#9CA3AF',
}

export default function Approvals() {
  const [approvals, setApprovals] = useState([])
  const [filter, setFilter] = useState('pending')
  const [editing, setEditing] = useState(null)
  const [editedInput, setEditedInput] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = selected => getApprovals(selected).then(setApprovals)
  useEffect(() => {
    getApprovals(filter).then(setApprovals).catch(err => setError(err.message))
  }, [filter])

  const decide = async (approval, decision) => {
    setBusy(approval.id)
    setError('')
    try {
      await decideApproval(
        approval.id,
        decision,
        decision === 'edit' ? editedInput : null,
        note,
      )
      setEditing(null)
      setEditedInput('')
      setNote('')
      await load(filter)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const beginEdit = approval => {
    setEditing(approval.id)
    setEditedInput(String(approval.input?.value ?? ''))
    setNote('')
  }

  return (
    <div>
      <OperationsHeader area="inbox" title="Decision Inbox"
        description="Review sensitive actions, edit their payload, or stop the run. Every decision becomes evidence for the next release."
        actions={<select aria-label="Approval status" value={filter} onChange={event => setFilter(event.target.value)} style={inputStyle}>
          <option value="pending">Pending</option>
          <option value="">All decisions</option>
          <option value="approved">Approved</option>
          <option value="edited">Edited</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>} />

      {error && <div style={errorBox}>{error}</div>}

      {!approvals.length ? <div style={emptyState}>
        <ShieldCheck size={42} color="#4B5563" />
        <h2 style={{ fontSize:17, marginTop:12 }}>No {filter || 'recorded'} decisions</h2>
        <p style={{ color:'#8B8FA3', fontSize:12, marginTop:6 }}>Approval-gated workflow actions and human exceptions will appear here.</p>
      </div> : <div style={{ display:'grid', gap:14 }}>
        {approvals.map(approval => {
          const isPending = approval.status === 'pending'
          const isEditing = editing === approval.id
          return <div key={approval.id} style={panel}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:16 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <h3 style={{ fontSize:15 }}>{approval.workflows?.name || 'Workflow approval'}</h3>
                  <span style={{ color:STATUS[approval.status], fontSize:10, textTransform:'uppercase' }}>{approval.status}</span>
                </div>
                <p style={{ color:'#9CA3AF', fontSize:12, marginTop:6 }}>
                  {approval.instructions || 'Review the current workflow value before it continues.'}
                </p>
              </div>
              <div style={{ color:'#6B7280', fontSize:10, textAlign:'right' }}>
                <div><Clock3 size={11} style={{ verticalAlign:'middle', marginRight:4 }} />Expires {new Date(approval.expires_at).toLocaleString()}</div>
                <div style={{ marginTop:4 }}>Node {approval.node_id}</div>
              </div>
            </div>

            <label style={labelStyle}>Input awaiting approval</label>
            {isEditing
              ? <textarea value={editedInput} onChange={event => setEditedInput(event.target.value)}
                  style={{ ...inputStyle, width:'100%', minHeight:100, boxSizing:'border-box' }} />
              : <pre style={valueBox}>{String(approval.input?.value ?? '')}</pre>}

            {isPending && <>
              <label style={labelStyle}>Decision note (optional)</label>
              <input value={note} onChange={event => setNote(event.target.value)}
                placeholder="Why are you approving or rejecting this?" style={{ ...inputStyle, width:'100%', boxSizing:'border-box' }} />
              <div style={{ display:'flex', gap:8, marginTop:12 }}>
                <button disabled={busy === approval.id} onClick={() => decide(approval, isEditing ? 'edit' : 'approve')} style={approveButton}>
                  {isEditing ? <Pencil size={13} /> : <Check size={13} />}
                  {isEditing ? 'Save and continue' : 'Approve'}
                </button>
                {!isEditing && <button onClick={() => beginEdit(approval)} style={secondaryButton}><Pencil size={13} /> Edit payload</button>}
                {isEditing && <button onClick={() => setEditing(null)} style={secondaryButton}>Cancel edit</button>}
                <button disabled={busy === approval.id} onClick={() => decide(approval, 'reject')} style={rejectButton}><X size={13} /> Reject</button>
              </div>
            </>}

            {!isPending && <div style={{ color:'#8B8FA3', fontSize:11, marginTop:12 }}>
              Resolved {approval.resolved_at ? new Date(approval.resolved_at).toLocaleString() : '—'}
              {approval.decision_note ? ` · ${approval.decision_note}` : ''}
            </div>}
          </div>
        })}
      </div>}
    </div>
  )
}

const panel = { background:'#171A23', border:'1px solid #292D3D', borderRadius:14, padding:18 }
const inputStyle = { background:'#101219', border:'1px solid #303447', borderRadius:8, color:'#E5E7EB', padding:'9px 10px', fontSize:12 }
const labelStyle = { display:'block', color:'#8B8FA3', fontSize:11, marginTop:14, marginBottom:6 }
const valueBox = { background:'#101219', border:'1px solid #292D3D', borderRadius:9, color:'#D1D5DB', padding:12, margin:0, whiteSpace:'pre-wrap', maxHeight:240, overflow:'auto', fontSize:12 }
const baseButton = { display:'inline-flex', alignItems:'center', gap:6, borderRadius:8, padding:'8px 11px', cursor:'pointer', fontSize:11 }
const approveButton = { ...baseButton, background:'#065F46', border:'1px solid #059669', color:'#A7F3D0' }
const rejectButton = { ...baseButton, background:'#3F1717', border:'1px solid #7F1D1D', color:'#FCA5A5' }
const secondaryButton = { ...baseButton, background:'#202431', border:'1px solid #34394D', color:'#C7CAD4' }
const errorBox = { background:'#2D1515', border:'1px solid #EF4444', borderRadius:9, padding:11, color:'#FCA5A5', fontSize:12, marginBottom:14 }
const emptyState = { background:'#171A23', border:'1px dashed #303447', borderRadius:14, padding:54, textAlign:'center' }
