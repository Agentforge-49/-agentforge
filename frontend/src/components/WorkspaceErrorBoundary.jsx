import { Component } from 'react'
import { AlertTriangle, LayoutDashboard, RefreshCw } from 'lucide-react'

export default class WorkspaceErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error:null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('Workspace page failed to load:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    const chunkFailure = /dynamically imported module|loading chunk|importing a module/i
      .test(String(this.state.error?.message || ''))
    return (
      <div style={{ minHeight:'65vh', display:'grid', placeItems:'center', padding:20 }}>
        <div style={{ width:'min(100%, 520px)', padding:28, border:'1px solid #DCE7DF', borderRadius:18, background:'#fff', boxShadow:'0 18px 50px rgba(20,48,36,.08)', textAlign:'center' }}>
          <div style={{ width:48, height:48, margin:'0 auto 16px', borderRadius:14, display:'grid', placeItems:'center', background:'#FEF3F2', color:'#B42318' }}>
            <AlertTriangle size={23} />
          </div>
          <h2 style={{ margin:'0 0 8px', color:'#143024', fontSize:20 }}>
            {chunkFailure ? 'A new AgentForge version is ready' : 'This workspace page needs another try'}
          </h2>
          <p style={{ margin:'0 auto 20px', maxWidth:410, color:'#607268', fontSize:13, lineHeight:1.6 }}>
            {chunkFailure
              ? 'Refresh once to load the newest production files. Your saved work is safe.'
              : 'The page could not finish loading. Refresh it, or return to the dashboard.'}
          </p>
          <div style={{ display:'flex', justifyContent:'center', flexWrap:'wrap', gap:9 }}>
            <button onClick={() => window.location.reload()} style={{ border:0, borderRadius:10, padding:'10px 15px', background:'#0B7A53', color:'#fff', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }}>
              <RefreshCw size={14} /> Refresh page
            </button>
            <button onClick={() => { window.location.href = '/dashboard' }} style={{ border:'1px solid #C8D8CE', borderRadius:10, padding:'10px 15px', background:'#fff', color:'#143024', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }}>
              <LayoutDashboard size={14} /> Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }
}
