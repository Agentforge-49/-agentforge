export const WORKSPACE_NAV_GROUPS = [
  { label:'Workspace', items:[
    { to:'/dashboard', icon:'home', label:'Home', activePaths:['/dashboard'] },
  ] },
  { label:'Build', items:[
    { to:'/studio', icon:'studio', label:'Studio', activePaths:['/studio', '/support-operations', '/agents', '/workflows', '/chains', '/multi-agents'] },
    { to:'/marketplace', icon:'templates', label:'Templates', activePaths:['/marketplace'] },
    { to:'/knowledge', icon:'knowledge', label:'Knowledge', activePaths:['/knowledge'] },
    { to:'/apps', icon:'apps', label:'Apps', activePaths:['/apps', '/credentials', '/triggers'] },
  ] },
  { label:'Operate', items:[
    { to:'/observability', icon:'runs', label:'Runs', activePaths:['/observability'] },
    { to:'/approvals', icon:'inbox', label:'Inbox', activePaths:['/approvals'] },
    { to:'/evaluations', icon:'quality', label:'Quality', activePaths:['/evaluations'] },
  ] },
  { label:'Manage', items:[
    { to:'/organizations', icon:'team', label:'Team', activePaths:['/organizations', '/enterprise-access'] },
    { to:'/developer', icon:'developer', label:'Developer', activePaths:['/developer'] },
    { to:'/settings', icon:'settings', label:'Settings', activePaths:['/settings', '/usage', '/billing', '/launch'] },
  ] },
]

export function isWorkspaceNavActive(location, item) {
  return item.activePaths.some(path => location === path || location.startsWith(`${path}/`))
}
