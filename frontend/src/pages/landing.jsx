import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', background: '#0F1117', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', textAlign: 'center', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <div>
        <div style={{ width: '68px', height: '68px', background: '#7C3AED', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '26px', margin: '0 auto 24px' }}>AF</div>
        <h1 style={{ fontSize: '48px', fontWeight: '700', marginBottom: '16px', letterSpacing: '-1px' }}>AgentForge</h1>
        <p style={{ color: '#9CA3AF', fontSize: '18px', maxWidth: '480px', margin: '0 auto 42px', lineHeight: '1.6' }}>
          Build AI workers in minutes, not workflows in weeks.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button onClick={() => navigate('/signup')} style={{ background: '#7C3AED', color: 'white', border: 'none', padding: '14px 32px', borderRadius: '12px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', fontFamily: 'system-ui' }}>
            Get Started Free
          </button>
          <button onClick={() => navigate('/login')} style={{ background: 'transparent', color: 'white', border: '1px solid #2A2D3E', padding: '14px 32px', borderRadius: '12px', fontSize: '16px', cursor: 'pointer', fontFamily: 'system-ui' }}>
            Sign In
          </button>
        </div>
      </div>
    </div>
  )
}
