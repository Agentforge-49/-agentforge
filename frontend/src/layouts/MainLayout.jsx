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
    <div style={{ display: 'flex', height: '100vh', background: '#0B0D12', color: 'white', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      <aside style={{ width: 224, background: '#13151C', borderRight: '1px solid #1F2230', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        <div style={{ padding: '20px 18px', borderBottom: '1px solid #1F2230', display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, fontSize: 13, letterSpacing: '-0.5px',
            boxShadow: '0 0 16px rgba(124,58,237,0.4)'
          }}>AF</div>
          <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.2px' }}>AgentForge</span>
        </div>

        <nav style={{ flex: 1, padding: '12px 10px' }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              position: 'relative',
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '10px 12px', borderRadius: 9, marginBottom: 3,
              textDecoration: 'none', fontSize: 13.5, fontWeight: isActive ? 500 : 400,
              background: isActive ? 'rgba(124,58,237,0.12)' : 'transparent',
              color:      isActive ? '#C4B5FD' : '#8B8FA3',
              transition: 'all 0.15s ease',
            })}>
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span style={{ position:'absolute', left:-10, top:'18%', bottom:'18%', width:3, borderRadius:3, background:'#7C3AED', boxShadow:'0 0 8px rgba(124,58,237,0.7)' }} />
                  )}
                  <Icon size={16.5} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '14px 14px', borderTop: '1px solid #1F2230' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: '#1F2230', border: '1px solid #2E3142',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 600, color: '#A78BFA'
            }}>{initials}</div>
            <span style={{ fontSize: 12, color: '#8B8FA3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{user?.email}</span>
          </div>
          <button onClick={logout} style={{
            display: 'flex', alignItems: 'center', gap: 7, width: '100%',
            padding: '8px 10px', background: 'transparent',
            border: '1px solid #1F2230', borderRadius: 8,
            color: '#8B8FA3', cursor: 'pointer', fontSize: 12,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#1A1D27'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8B8FA3' }}
          >
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
