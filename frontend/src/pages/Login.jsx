import { ArrowRight, CircleCheck } from 'lucide-react'
import { useState } from 'react'
import BrandLogo from '../components/BrandLogo'
import { Link, useNavigate } from '../lib/router.jsx'
import { supabase } from '../lib/supabase'
import './Auth.css'

export default function Login({ setUser }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    setUser(data.user)
    navigate('/dashboard')
  }

  return (
    <div className="auth-page">
      <section className="auth-panel">
        <button className="auth-brand" type="button" onClick={() => navigate('/')} aria-label="Back to AgentForge home">
          <BrandLogo size={40} />
        </button>

        <div className="auth-form-wrap">
          <h1>Welcome back.</h1>
          <p>Sign in to continue building dependable AI workflows.</p>

          <form className="auth-form" onSubmit={handleLogin}>
            <div className="auth-field">
              <label htmlFor="login-email">Work email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="you@company.com"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                placeholder="Enter your password"
              />
            </div>

            {error && <div className="auth-message auth-message--error" role="alert">{error}</div>}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>

          <p className="auth-switch">
            New to AgentForge? <Link to="/signup">Create a free account</Link>
          </p>
        </div>
      </section>

      <aside className="auth-visual">
        <div className="auth-visual__content">
          <span className="auth-visual__eyebrow">One workspace. Complete control.</span>
          <h2>Turn your best process into a reliable AI system.</h2>
          <p>
            Build agents, connect the work, add human judgment, and understand
            every run from start to finish.
          </p>
          <div className="auth-visual__proof">
            <span><CircleCheck size={18} /> Durable workflows with recovery</span>
            <span><CircleCheck size={18} /> Human approvals for sensitive actions</span>
            <span><CircleCheck size={18} /> Evaluations before production</span>
          </div>
        </div>
      </aside>
    </div>
  )
}
