export const WORKSPACE_NAV_GROUPS = [
  { label:'Start here', items:[
    { to:'/dashboard', icon:'home', label:'Home', activePaths:['/dashboard'] },
    { to:'/studio', icon:'studio', label:'Build', activePaths:['/studio', '/build', '/support-operations', '/agents', '/workflows', '/chains', '/multi-agents'] },
    { to:'/copilot', icon:'copilot', label:'Copilot', activePaths:['/copilot'] },
    { to:'/observability', icon:'runs', label:'Activity', activePaths:['/observability', '/approvals'] },
    { to:'/apps', icon:'apps', label:'Apps', activePaths:['/apps', '/credentials', '/triggers'] },
    { to:'/marketplace', icon:'templates', label:'Templates', activePaths:['/marketplace'] },
  ] },
  { label:'Advanced', advanced:true, items:[
    { to:'/knowledge', icon:'knowledge', label:'Knowledge', activePaths:['/knowledge'] },
    { to:'/evaluations', icon:'quality', label:'Quality', activePaths:['/evaluations'] },
    { to:'/organizations', icon:'team', label:'Team', activePaths:['/organizations', '/enterprise-access'] },
    { to:'/developer', icon:'developer', label:'Developer', activePaths:['/developer'] },
    { to:'/settings', icon:'settings', label:'Settings', activePaths:['/settings', '/usage', '/billing', '/launch'] },
  ] },
]

export function isWorkspaceNavActive(location, item) {
  return item.activePaths.some(path => location === path || location.startsWith(`${path}/`))
}
