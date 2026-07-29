import { useEffect, useState } from 'react'

import { deleteAccount, getSettings, updateProfile } from '../lib/api'
import { supabase } from '../lib/supabase'
import { Link } from '../lib/router.jsx'

const card = {
  background:'#1A1D27',
  border:'1px solid #2A2D3E',
  borderRadius:16,
  padding:24,
  marginBottom:24,
}
const input = {
  width:'100%',
  padding:12,
  borderRadius:10,
  border:'1px solid #2A2D3E',
  background:'#0F1117',
  color:'#FFFFFF',
  outline:'none',
  boxSizing:'border-box',
}
const primaryButton = {
  background:'#7C3AED',
  color:'#FFFFFF',
  border:0,
  borderRadius:10,
  padding:'11px 18px',
  cursor:'pointer',
  fontWeight:600,
}

export default function Settings() {
  const [data, setData] = useState(null)
  const [fullName, setFullName] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')

  useEffect(() => {
    getSettings()
      .then(result => {
        setData(result)
        setFullName(result.profile?.full_name || '')
      })
      .catch(err => setError(err.message))
  }, [])

  const save = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const profile = await updateProfile(fullName)
      setData(current => ({ ...current, profile }))
      setNotice('Profile saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const removeAccount = async () => {
    setBusy(true)
    setError('')
    try {
      await deleteAccount(deleteText)
      await supabase.auth.signOut()
      window.location.assign('/')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (!data && !error) return <div style={{ color:'#8B8FA3' }}>Loading settings…</div>

  const usage = data?.usage || { used:0, limit:0, percentage:0, plan:'Free' }

  return (
    <div style={{ maxWidth:900, margin:'0 auto' }}>
      <h1 style={{ fontSize:30, margin:'0 0 8px' }}>Settings</h1>
      <p style={{ color:'#8B8FA3', margin:'0 0 24px' }}>
        Manage your profile, usage, and account lifecycle.
      </p>

      {error && (
        <div role="alert" style={{ ...card, color:'#FCA5A5', borderColor:'#7F1D1D' }}>
          {error}
        </div>
      )}

      <form onSubmit={save} style={card}>
        <h2 style={{ fontSize:18, margin:'0 0 20px' }}>Profile</h2>
        <label style={{ display:'block', color:'#9CA3AF', fontSize:13, marginBottom:7 }}>
          Email address
        </label>
        <input
          value={data?.email || ''}
          readOnly
          style={{ ...input, color:'#6B7280', marginBottom:16, cursor:'not-allowed' }}
        />
        <label style={{ display:'block', color:'#9CA3AF', fontSize:13, marginBottom:7 }}>
          Full name
        </label>
        <input
          value={fullName}
          minLength={2}
          maxLength={100}
          required
          onChange={event => setFullName(event.target.value)}
          style={{ ...input, marginBottom:16 }}
        />
        <button type="submit" disabled={busy} style={{ ...primaryButton, opacity:busy ? 0.6 : 1 }}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        {notice && <span role="status" style={{ marginLeft:12, color:'#4ADE80' }}>{notice}</span>}
      </form>

      <section style={card}>
        <h2 style={{ fontSize:18, margin:'0 0 8px' }}>Usage</h2>
        <div style={{ color:'#C4B5FD', fontSize:13, marginBottom:14 }}>{usage.plan} plan</div>
        <div style={{ marginBottom:10 }}>
          {usage.used.toLocaleString()} of {usage.limit.toLocaleString()} model calls used this month
        </div>
        <div style={{ height:10, background:'#0F1117', borderRadius:999, overflow:'hidden' }}>
          <div style={{
            height:'100%',
            width:`${Math.min(100, usage.percentage)}%`,
            background:'#7C3AED',
          }} />
        </div>
        <Link to="/usage" style={{ display:'inline-block', marginTop:16, color:'#A78BFA' }}>
          View detailed usage and plans
        </Link>
      </section>

      <section style={{ ...card, borderColor:'#5F2424' }}>
        <h2 style={{ fontSize:18, color:'#F87171', margin:'0 0 10px' }}>Danger zone</h2>
        <p style={{ color:'#9CA3AF', lineHeight:1.6 }}>
          Account deletion is permanent. You must first delete or transfer organizations you own.
          Retained live billing or compliance records may require support-assisted deletion.
        </p>
        {!showDelete ? (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            style={{ ...primaryButton, background:'transparent', border:'1px solid #EF4444', color:'#F87171' }}
          >
            Delete account
          </button>
        ) : (
          <div>
            <label style={{ display:'block', color:'#FCA5A5', fontSize:13, marginBottom:7 }}>
              Type DELETE MY ACCOUNT to confirm
            </label>
            <input
              value={deleteText}
              onChange={event => setDeleteText(event.target.value)}
              autoComplete="off"
              style={{ ...input, marginBottom:12 }}
            />
            <div style={{ display:'flex', gap:10 }}>
              <button
                type="button"
                disabled={deleteText !== 'DELETE MY ACCOUNT' || busy}
                onClick={removeAccount}
                style={{
                  ...primaryButton,
                  background:'#DC2626',
                  cursor:deleteText === 'DELETE MY ACCOUNT' ? 'pointer' : 'not-allowed',
                  opacity:deleteText === 'DELETE MY ACCOUNT' && !busy ? 1 : 0.5,
                }}
              >
                Permanently delete account
              </button>
              <button
                type="button"
                onClick={() => { setShowDelete(false); setDeleteText('') }}
                style={{ ...primaryButton, background:'#282B38' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
