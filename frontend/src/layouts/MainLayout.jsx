import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Bot, Store, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'

const NAV = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/agents/new',  icon: Bot,             label: 'New Agent'   },
  { to: '/marketplace', icon: Store,           label: 'Marketplace' },
]

export default function MainLayout({ children, user }) {
  const navigate = useNavigate()

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = (user?.email || 'U').slice(0, 2).toUpperCase()

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0F1117', color: 'white', fontFamily: 'system-ui, sans-serif' }}>

      <aside style={{ width: '220px', background: '#1A1D27', borderRight: '1px solid #2A2D3E', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        <div style={{ padding: '18px 16px', borderBottom: '1px solid #2A2D3E', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', background: '#7C3AED', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px' }}>AF</div>
          <span style={{ fontWeight: '600', fontSize: '15px' }}>AgentForge</span>
        </div>

        <nav style={{ flex: 1, padding: '10px' }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', borderRadius: '8px', marginBottom: '3px',
              textDecoration: 'none', fontSize: '14px',
              background: isActive ? '#7C3AED' : 'transparent',
              color: isActive ? '#ffffff' : '#9CA3AF',
            })}>
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '14px 12px', borderTop: '1px solid #2A2D3E' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px' }}>
            <div style={{ width: '30px', height: '30px', background: '#374151', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700' }}>{initials}</div>
            <span style={{ fontSize: '12px', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{user?.email}</span>
          </div>
          <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '7px', width: '100%', padding: '8px 10px', background: 'transparent', border: '1px solid #2A2D3E', borderRadius: '8px', color: '#9CA3AF', cursor: 'pointer', fontSize: '12px', fontFamily: 'system-ui' }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'auto', padding: '28px' }}>
        {children}
      </main>
    </div>
  )
}
