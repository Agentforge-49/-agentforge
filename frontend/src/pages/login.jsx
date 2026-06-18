import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login({ setUser }) {
  const navigate = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setUser(data.user)
    navigate('/dashboard')
  }

  const inputStyle = {
    width: '100%', background: '#1A1D27', border: '1px solid #2A2D3E',
    borderRadius: '10px', padding: '11px 14px', color: 'white',
    fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: 'system-ui',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0F1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '52px', height: '52px', background: '#7C3AED', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '20px', color: 'white', margin: '0 auto 16px' }}>AF</div>
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: 'white', marginBottom: '6px' }}>Welcome back</h1>
          <p style={{ color: '#9CA3AF', fontSize: '14px', margin: 0 }}>Sign in to your AgentForge account</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#9CA3AF', marginBottom: '6px' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" style={inputStyle} />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#9CA3AF', marginBottom: '6px' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" style={inputStyle} />
          </div>

          {error && (
            <div style={{ background: '#2D1515', border: '1px solid #EF4444', borderRadius: '8px', padding: '10px 14px', color: '#FCA5A5', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ width: '100%', background: loading ? '#5B21B6' : '#7C3AED', color: 'white', border: 'none', padding: '13px', borderRadius: '10px', fontSize: '15px', fontWeight: '500', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'system-ui' }}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', color: '#9CA3AF', fontSize: '14px' }}>
          No account?{' '}
          <Link to="/signup" style={{ color: '#A78BFA', textDecoration: 'none' }}>Sign up free</Link>
        </p>
      </div>
    </div>
  )
}
