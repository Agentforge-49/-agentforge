import { useState } from 'react'
import { NavLink, useNavigate } from '../lib/router.jsx'
import { Activity, BookOpen, Building2, Code2, Fingerprint, FlaskConical, Gauge, LayoutDashboard, Bot, ReceiptText, Rocket, Settings, Store, Link2, LogOut, Menu, Network, Workflow, X, Zap, KeyRound, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import BrandLogo from '../components/BrandLogo'

const NAV = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/agents/new',  icon: Bot,             label: 'New Agent'   },
  { to: '/chains',      icon: Link2,           label: 'Chains'      },
  { to: '/workflows',   icon: Workflow,        label: 'Workflows'   },
  { to: '/triggers',    icon: Zap,             label: 'Triggers'    },
  { to: '/credentials', icon: KeyRound,        label: 'Credentials' },
  { to: '/approvals',   icon: ShieldCheck,     label: 'Approvals'   },
  { to: '/observability', icon: Activity,       label: 'Observability' },
  { to: '/evaluations', icon: FlaskConical,     label: 'Evaluations' },
  { to: '/knowledge',   icon: BookOpen,         label: 'Knowledge'   },
  { to: '/multi-agents', icon: Network,         label: 'Multi-Agent' },
  { to: '/marketplace', icon: Store,           label: 'Marketplace' },
  { to: '/usage',       icon: Gauge,           label: 'Usage & Plans' },
  { to: '/organizations', icon: Building2,      label: 'Organizations' },
  { to: '/enterprise-access', icon: Fingerprint, label: 'Enterprise Access' },
  { to: '/billing',     icon: ReceiptText,      label: 'Billing' },
  { to: '/developer',   icon: Code2,            label: 'Developer Platform' },
  { to: '/launch',      icon: Rocket,           label: 'Launch Readiness' },
  { to: '/settings',    icon: Settings,         label: 'Settings' },
]

export default function MainLayout({ children, user }) {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = (user?.email || 'U').slice(0, 2).toUpperCase()

  return (
    <div className="workspace-shell">

      <header className="workspace-mobile-header">
        <button className="workspace-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <BrandLogo size={29} wordmarkColor="#F8FAFC" />
      </header>

      {mobileOpen && <button className="workspace-overlay" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}

      <aside className={`workspace-sidebar${mobileOpen ? ' workspace-sidebar-open' : ''}`}>

        <div style={{ padding: '20px 18px', borderBottom: '1px solid #1F2230', display: 'flex', alignItems: 'center', gap: 11 }}>
          <BrandLogo size={32} wordmarkColor="#F8FAFC" />
          <button className="workspace-close-button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>

        <nav style={{ flex: 1, padding: '12px 10px', overflowY:'auto' }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} onClick={() => setMobileOpen(false)} style={({ isActive }) => ({
              position: 'relative',
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '10px 12px', borderRadius: 9, marginBottom: 3,
              textDecoration: 'none', fontSize: 13.5, fontWeight: isActive ? 500 : 400,
              background: isActive ? 'rgba(16,185,129,0.12)' : 'transparent',
              color:      isActive ? '#6EE7B7' : '#8B8FA3',
              transition: 'all 0.15s ease',
            })}>
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span style={{ position:'absolute', left:-10, top:'18%', bottom:'18%', width:3, borderRadius:3, background:'#10B981', boxShadow:'0 0 8px rgba(16,185,129,0.55)' }} />
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
              fontSize: 11, fontWeight: 600, color: '#6EE7B7'
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

      <main className="workspace-main">
        {children}
      </main>
    </div>
  )
}
