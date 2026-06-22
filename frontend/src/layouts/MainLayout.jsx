import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Bot, Store, Link2, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'

const NAV = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/agents/new',  icon: Bot,             label: 'New Agent'   },
  { to: '/chains',      icon: Link2,           label: 'Chains'      },
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

      <aside style={{ width: 220, background: '#1A1D27', borderRight: '1px solid #2A2D3E', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        <div style={{ padding: '18px 16px', borderBottom: '1px solid #2A2D3E', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: '#7C3AED', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>AF</div>
          <span style={{ fontWeight: 600, fontSize: 15 }}>AgentForge</span>
        </div>

        <nav style={{ flex: 1, padding: 10 }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, marginBottom: 3,
              textDecoration: 'none', fontSize: 14,
              background: isActive ? '#7C3AED' : 'transparent',
              color:      isActive ? '#fff'    : '#9CA3AF',
            })}>
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '14px 12px', borderTop: '1px solid #2A2D3E' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <div style={{ width: 30, height: 30, background: '#374151', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{initials}</div>
            <span style={{ fontSize: 12, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{user?.email}</span>
          </div>
          <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '8px 10px', background: 'transparent', border: '1px solid #2A2D3E', borderRadius: 8, color: '#9CA3AF', cursor: 'pointer', fontSize: 12 }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        {children}
      </main>
    </div>
  )
}
