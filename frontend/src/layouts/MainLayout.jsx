import { useState } from 'react'
import { NavLink, useNavigate } from '../lib/router.jsx'
import { Activity, BookOpen, Building2, Code2, Fingerprint, FlaskConical, Gauge, LayoutDashboard, Bot, ReceiptText, Rocket, Settings, Store, Link2, LogOut, Menu, Network, Workflow, X, Zap, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import BrandLogo from '../components/BrandLogo'
import '../styles/Workspace.css'

const NAV_GROUPS = [
  { label:'Workspace', items:[
    { to:'/dashboard', icon:LayoutDashboard, label:'Dashboard' },
    { to:'/marketplace', icon:Store, label:'Marketplace' },
  ] },
  { label:'Build', items:[
    { to:'/agents/new', icon:Bot, label:'New Agent' },
    { to:'/workflows', icon:Workflow, label:'Workflows' },
    { to:'/chains', icon:Link2, label:'Chains' },
    { to:'/multi-agents', icon:Network, label:'Multi-Agent' },
    { to:'/knowledge', icon:BookOpen, label:'Knowledge' },
  ] },
  { label:'Operate', items:[
    { to:'/triggers', icon:Zap, label:'Triggers' },
    { to:'/approvals', icon:ShieldCheck, label:'Approvals' },
    { to:'/observability', icon:Activity, label:'Observability' },
    { to:'/evaluations', icon:FlaskConical, label:'Evaluations' },
    { to:'/credentials', icon:KeyRound, label:'Credentials' },
  ] },
  { label:'Scale', items:[
    { to:'/organizations', icon:Building2, label:'Organizations' },
    { to:'/enterprise-access', icon:Fingerprint, label:'Enterprise Access' },
    { to:'/developer', icon:Code2, label:'Developer Platform' },
    { to:'/usage', icon:Gauge, label:'Usage & Plans' },
    { to:'/billing', icon:ReceiptText, label:'Billing' },
    { to:'/launch', icon:Rocket, label:'Launch Readiness' },
    { to:'/settings', icon:Settings, label:'Settings' },
  ] },
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
        <BrandLogo size={29} wordmarkColor="#143024" />
      </header>

      {mobileOpen && <button className="workspace-overlay" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}

      <aside className={`workspace-sidebar${mobileOpen ? ' workspace-sidebar-open' : ''}`}>

        <div className="workspace-brand">
          <div className="workspace-brand-row">
            <BrandLogo size={32} wordmarkColor="#143024" />
            <button className="workspace-close-button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button>
          </div>
          <div className="workspace-badge"><Sparkles size={11} /> Personal workspace</div>
        </div>

        <nav className="workspace-nav">
          {NAV_GROUPS.map(group => (
            <div className="workspace-nav-group" key={group.label}>
              <div className="workspace-nav-label">{group.label}</div>
              {group.items.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => `workspace-nav-link${isActive ? ' workspace-nav-link-active' : ''}`}>
                  {({ isActive }) => <>
                    {isActive && <span className="workspace-nav-marker" />}
                    <Icon size={16.5} /> {label}
                  </>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="workspace-account">
          <div className="workspace-account-profile">
            <div className="workspace-avatar">{initials}</div>
            <span className="workspace-email">{user?.email}</span>
          </div>
          <button onClick={logout} className="workspace-signout">
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
