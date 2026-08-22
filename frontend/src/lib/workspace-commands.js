export const WORKSPACE_COMMANDS = [
  { id:'create', label:'Create an automation', description:'Start in Build with a guided path', to:'/studio', group:'Create', icon:'wand', keywords:'new workflow agent chain build automation' },
  { id:'ask', label:'Ask AgentForge Copilot', description:'Describe an outcome or diagnose a failed run', to:'/copilot', group:'Create', icon:'sparkles', keywords:'chat help invent assistant troubleshoot' },
  { id:'connect', label:'Connect an app', description:'Choose from 100 honest connection paths', to:'/apps', group:'Set up', icon:'plug', keywords:'integration oauth credential webhook api' },
  { id:'template', label:'Use a proven template', description:'Install a complete, approval-first starter', to:'/marketplace', group:'Create', icon:'layout', keywords:'starter recipe marketplace example' },
  { id:'activity', label:'Inspect run activity', description:'Follow traces, failures, retries, cost, and latency', to:'/observability', group:'Operate', icon:'activity', keywords:'runs logs monitor failures trace history' },
  { id:'approvals', label:'Review approvals', description:'Decide which prepared actions can continue', to:'/approvals', group:'Operate', icon:'shield', keywords:'human review queue approve reject' },
  { id:'knowledge', label:'Add knowledge', description:'Ground agents in files, text, websites, Drive, or Notion', to:'/knowledge', group:'Set up', icon:'book', keywords:'rag pdf docx csv upload source citations' },
  { id:'quality', label:'Test automation quality', description:'Create evaluations and inspect pass rates', to:'/evaluations', group:'Improve', icon:'flask', keywords:'eval test score benchmark quality' },
  { id:'home', label:'Open Command Center', description:'See active work, risks, approvals, and readiness', to:'/dashboard', group:'Navigate', icon:'home', keywords:'dashboard overview command center status' },
  { id:'settings', label:'Workspace settings', description:'Configure models, profile, plan, and launch readiness', to:'/settings', group:'Navigate', icon:'settings', keywords:'configuration billing usage models profile launch' },
]

export function filterWorkspaceCommands(query, commands = WORKSPACE_COMMANDS) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return commands
  const terms = normalized.split(/\s+/).filter(Boolean)
  return commands.filter(command => {
    const haystack = `${command.label} ${command.description} ${command.group} ${command.keywords}`.toLowerCase()
    return terms.every(term => haystack.includes(term))
  })
}
