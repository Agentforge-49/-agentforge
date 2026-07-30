import { ArrowRight, CircleCheck } from 'lucide-react'
import { useState } from 'react'
import BrandLogo from '../components/BrandLogo'
import { Link, useNavigate } from '../lib/router.jsx'
import { supabase } from '../lib/supabase'
import './Auth.css'

export default function Signup({ setUser }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSignup = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const { data, error: authError } = await supabase.auth.signUp({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (data.user && data.session) {
      setUser(data.user)
      navigate('/dashboard')
    } else {
      setMessage('Check your email to confirm your account, then sign in.')
    }

    setLoading(false)
  }

  return (
    <div className="auth-page">
      <section className="auth-panel">
        <button className="auth-brand" type="button" onClick={() => navigate('/')} aria-label="Back to AgentForge home">
          <BrandLogo size={40} />
        </button>

        <div className="auth-form-wrap">
          <h1>Start building.</h1>
          <p>Create your workspace and launch your first AI workflow.</p>

          <form className="auth-form" onSubmit={handleSignup}>
            <div className="auth-field">
              <label htmlFor="signup-email">Work email</label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="you@company.com"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                placeholder="At least 6 characters"
              />
            </div>

            {error && <div className="auth-message auth-message--error" role="alert">{error}</div>}
            {message && <div className="auth-message auth-message--success" role="status">{message}</div>}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create free account'}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </section>

      <aside className="auth-visual">
        <div className="auth-visual__content">
          <span className="auth-visual__eyebrow">From idea to production</span>
          <h2>Build automation your team can actually trust.</h2>
          <p>
            Combine AI reasoning, deterministic workflows, and human decisions
            in one governed platform.
          </p>
          <div className="auth-visual__proof">
            <span><CircleCheck size={18} /> Start without a credit card</span>
            <span><CircleCheck size={18} /> Test safely before publishing</span>
            <span><CircleCheck size={18} /> Keep every important action visible</span>
          </div>
        </div>
      </aside>
    </div>
  )
}
