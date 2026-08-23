const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'how', 'i', 'in', 'is',
  'it', 'me', 'my', 'of', 'on', 'or', 'the', 'to', 'we', 'what', 'with', 'you',
]);

const TOPICS = [
  {
    id:'overview',
    phrases:['what is agentforge', 'what does agentforge do', 'explain agentforge', 'how does agentforge work', 'what can you do', 'help me understand', 'simple words'],
    words:['agentforge', 'platform', 'explain', 'understand', 'overview', 'beginner', 'simple'],
    title:'AgentForge turns a business process into a controlled AI workflow',
    text:'In simple terms: you describe repetitive work, connect the apps involved, and AgentForge builds a step-by-step workflow. AI handles judgment, normal steps handle predictable work, and a person can approve anything important before it happens.',
    bullets:['Describe the request that starts the work.', 'Choose what AI should decide or create.', 'Review the final action before sending data to another app.'],
    actions:[{ label:'See how it works', path:'/#how-it-works' }, { label:'Build free', path:'/signup', guest:true }, { label:'Open your workspace', path:'/dashboard', auth:true }],
    followUps:['What should I build first?', 'Which apps work now?'],
  },
  {
    id:'troubleshooting',
    phrases:['not working', 'does not work', 'is broken', 'something failed', 'connector failed', 'app not working', 'why is it failing'],
    words:['broken', 'problem', 'issue', 'error', 'failure', 'failing', 'stuck'],
    title:'Find the failing step before changing the workflow',
    text:'Open Runs, select the failed run, and read the first red step. AgentForge keeps the input, output, provider response, retry history, and approval state together so you can fix the actual cause.',
    bullets:['Connection errors: test or rotate the credential in Apps.', 'Input errors: compare the failing payload with a successful test.', 'AI quality errors: add a Quality case before changing the prompt.'],
    actions:[{ label:'Open failed runs', path:'/observability', auth:true }, { label:'Check app connections', path:'/apps', auth:true }],
    followUps:['How do I test safely?', 'How are credentials stored?'],
  },
  {
    id:'starter-kit',
    phrases:['which workflow', 'which template', 'starter kit', 'start first', 'build first', 'use case'],
    words:['template', 'workflow', 'starter', 'support', 'lead', 'research', 'begin'],
    title:'Start with one measurable workflow',
    text:'Choose the smallest workflow that creates a real business result this week. AgentForge currently has twelve complete, approval-gated starter kits.',
    bullets:[
      'Support triage: classify a request, review it, then send the approved handoff to Slack.',
      'Lead qualification: score a lead, review the evidence, then append it to Google Sheets.',
      'Research delivery: approve a bounded report, then save it to Drive and send it by email.',
    ],
    actions:[{ label:'Compare starter kits', path:'/templates' }, { label:'Open marketplace', path:'/marketplace', auth:true }],
    followUps:['How do approvals work?', 'What should I connect first?'],
  },
  {
    id:'support',
    phrases:['support triage', 'customer support', 'support ticket', 'help desk', 'slack workflow'],
    words:['support', 'ticket', 'customer', 'triage', 'slack', 'escalation'],
    title:'Use the support triage starter kit',
    text:'It turns an incoming customer request into a structured priority, category, risk level, recommended action, and response draft. Start observe-only, then have a person approve each Slack delivery.',
    bullets:['Best first metric: time to first triage.', 'Every install includes safety-oriented quality cases.', 'Fully autonomous delivery stays locked until production evidence supports it.'],
    actions:[{ label:'Open support launch cockpit', path:'/support-operations', auth:true }, { label:'See the workflow', path:'/templates' }],
    followUps:['How is customer data protected?', 'How do I test a workflow?'],
  },
  {
    id:'lead',
    phrases:['lead qualification', 'qualify leads', 'sales workflow', 'revenue operations', 'google sheets'],
    words:['lead', 'sales', 'revenue', 'qualification', 'score', 'sheets'],
    title:'Use the lead qualification starter kit',
    text:'It produces an explainable fit score and recommendation from the facts you provide, pauses for review, and records only the approved result in Google Sheets.',
    bullets:['Best first metric: qualified leads reviewed per hour.', 'Missing budget, authority, urgency, or fit stays visible instead of being invented.', 'You need a Google connection and the destination spreadsheet ID.'],
    actions:[{ label:'View starter kits', path:'/templates' }, { label:'Connect Google', path:'/credentials', auth:true }],
    followUps:['What can Google connect to?', 'How do approvals work?'],
  },
  {
    id:'research',
    phrases:['research report', 'research workflow', 'decision brief', 'send report'],
    words:['research', 'report', 'brief', 'evidence', 'drive', 'email'],
    title:'Use approved research delivery',
    text:'This kit creates a decision brief from supplied evidence, clearly separates facts from inference, and waits for approval before archiving to Drive and sending through Resend.',
    bullets:['Best first metric: time from question to approved brief.', 'The starter does not pretend it browsed or verified sources it did not receive.', 'You need Google and Resend connections for both delivery branches.'],
    actions:[{ label:'View the research kit', path:'/templates' }, { label:'Set up connections', path:'/credentials', auth:true }],
    followUps:['What integrations are live?', 'How do I keep reports safe?'],
  },
  {
    id:'safety',
    phrases:['how is it safe', 'how is agentforge safe', 'human approval', 'approval gate', 'security', 'protect data'],
    words:['safe', 'safety', 'approval', 'secure', 'security', 'risk', 'governance', 'audit', 'privacy'],
    title:'Control comes before external action',
    text:'AgentForge combines human approval steps, encrypted credentials, versioned agents, bounded execution, usage controls, and inspectable run traces. The flagship kits pause before sending data to external tools.',
    bullets:['Secrets are selected by reference and are not placed into workflow prompts.', 'Published versions make production behavior traceable.', 'Approvals, evaluations, observability, and launch checks give operators separate control points.'],
    actions:[{ label:'Explore platform controls', path:'/#platform' }, { label:'Open approvals', path:'/approvals', auth:true }],
    followUps:['How are credentials stored?', 'What should I check before launch?'],
  },
  {
    id:'connections',
    phrases:['what can i connect', 'which apps work', 'apps work now', 'connect tools', 'connect slack', 'connect google', 'integrations', 'credentials'],
    words:['app', 'apps', 'connect', 'connection', 'integration', 'credential', 'slack', 'google', 'resend', 'supabase', 'webhook'],
    title:'Connect only what your first workflow needs',
    text:'AgentForge has 100 curated app connections. Twenty-five use typed guided actions; the other 75 use authenticated HTTP requests or signed webhook triggers.',
    bullets:['Typed actions cover Slack, Google, GitHub, Discord, Notion, Airtable, HubSpot, Salesforce, Stripe, Shopify, Jira, Linear, Twilio, Zendesk, Resend, and Supabase.', 'Universal connections support bearer tokens, custom API-key headers, and Basic authentication.', 'Credentials stay encrypted and external actions can remain approval-gated.'],
    actions:[{ label:'See apps', path:'/apps' }, { label:'Manage connections', path:'/credentials', auth:true }],
    followUps:['Which workflow fits me?', 'How are credentials stored?'],
  },
  {
    id:'credentials',
    phrases:['how are credentials stored', 'api key safety', 'secret storage', 'encrypted vault'],
    words:['credential', 'credentials', 'secret', 'token', 'key', 'encrypted', 'vault', 'oauth'],
    title:'Credentials stay outside your prompts',
    text:'AgentForge stores provider secrets in its encrypted credential vault and exposes only masked metadata in the interface. OAuth connections and vault credentials are ownership-checked before a workflow can use them.',
    bullets:['Never paste a secret into an agent prompt or ordinary workflow input.', 'Use the connection test after storing or rotating a credential.', 'Disconnect or rotate access from the Credentials page when needed.'],
    actions:[{ label:'Open credentials', path:'/credentials', auth:true }, { label:'Review integrations', path:'/integrations' }],
    followUps:['What should I connect first?', 'How is AgentForge safe?'],
  },
  {
    id:'pricing',
    phrases:['can i start free', 'no money', 'how much', 'credit card', 'pricing', 'free plan'],
    words:['free', 'price', 'pricing', 'cost', 'money', 'plan', 'billing', 'card', 'usage', 'limits', 'tokens'],
    title:'You can build and test on the Free plan',
    text:'The launch Free plan is $0 with no credit card required. It includes 50 model calls, 100K tokens, up to 10 agents, up to 20 workflows, approvals, run traces, knowledge, and marketplace access each month.',
    bullets:['Pro access is currently requested inside the workspace.', 'No paid checkout is required during this launch phase.', 'Usage and limits remain visible before you scale.'],
    actions:[{ label:'Compare plans', path:'/pricing' }, { label:'Create free account', path:'/signup', guest:true }],
    followUps:['Which workflow should I build first?', 'What counts toward usage?'],
  },
  {
    id:'building-blocks',
    phrases:['agent vs workflow', 'workflow vs chain', 'what is an agent', 'multi agent', 'how does it work'],
    words:['agent', 'agents', 'workflow', 'workflows', 'chain', 'chains', 'multi-agent', 'builder'],
    title:'Use the simplest building block that fits',
    text:'An agent handles one focused reasoning task. A workflow combines agents with deterministic steps, conditions, approvals, and connectors. Chains sequence agent work, while multi-agent teams coordinate specialists.',
    bullets:['Start with one agent when the task has one clear input and output.', 'Use a workflow when an external action or approval must be controlled.', 'Add multiple agents only when distinct specialist roles improve the result.'],
    actions:[{ label:'Open Studio', path:'/studio', auth:true }, { label:'Start from a template', path:'/marketplace', auth:true }],
    followUps:['Which starter kit fits me?', 'How do I test before publishing?'],
  },
  {
    id:'testing',
    phrases:['how do i test', 'test workflow', 'before publishing', 'evaluation', 'debug', 'not working'],
    words:['test', 'testing', 'evaluate', 'evaluation', 'debug', 'error', 'failed', 'trace', 'observability'],
    title:'Test privately, inspect the trace, then publish',
    text:'Use a representative non-sensitive input, inspect every step and connector result, add evaluation cases for expected behavior, and publish only after the run matches your safety contract.',
    bullets:['Observability shows execution behavior and failures.', 'Evaluations turn important expectations into repeatable checks.', 'Pause a workflow or agent if production behavior is uncertain.'],
    actions:[{ label:'Open evaluations', path:'/evaluations', auth:true }, { label:'Inspect observability', path:'/observability', auth:true }],
    followUps:['What should I check before launch?', 'How do approvals work?'],
  },
  {
    id:'launch',
    phrases:['ready to launch', 'before launch', 'production ready', 'launch checklist', 'which metric', 'what metric'],
    words:['launch', 'production', 'ready', 'checklist', 'deploy', 'recovery', 'metric', 'measure', 'outcome'],
    title:'Launch one controlled workflow first',
    text:'Before launch, verify provider connections, run representative tests, confirm approval ownership, inspect usage limits, test failure recovery, and define one measurable outcome.',
    bullets:['Start with a reversible workflow and a small user group.', 'Keep external actions approval-gated until evidence supports more autonomy.', 'Use Runs and Quality to verify behavior before increasing autonomy.'],
    actions:[{ label:'Open Release Center', path:'/launch', auth:true }, { label:'Review usage limits', path:'/usage', auth:true }],
    followUps:['How do I test a workflow?', 'Which metric should I track?'],
  },
  {
    id:'api',
    phrases:['developer api', 'api access', 'webhook', 'embed', 'integrate api'],
    words:['api', 'developer', 'webhook', 'webhooks', 'trigger', 'automation'],
    title:'Use APIs and webhooks when the workflow is proven',
    text:'AgentForge includes scoped developer API keys, signed webhook subscriptions, and workflow triggers. Prove the workflow manually first, then automate its input path.',
    bullets:['Give API keys only the scopes they need.', 'Verify webhook signatures and keep endpoints public but controlled.', 'Monitor retries, failures, and usage after activation.'],
    actions:[{ label:'Developer platform', path:'/developer', auth:true }, { label:'Manage triggers', path:'/triggers', auth:true }],
    followUps:['How is API access secured?', 'What should I check before launch?'],
  },
];

function normalizedWords(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function scoreTopic(topic, normalized, words) {
  let score = topic.phrases.reduce((total, phrase) => total + (normalized.includes(phrase) ? 8 : 0), 0);
  const usefulWords = words.filter(word => !STOP_WORDS.has(word));
  score += usefulWords.reduce((total, word) => total + (topic.words.includes(word) ? 2 : 0), 0);
  return score;
}

function fallbackFor(path, signedIn) {
  if (path.startsWith('/support-operations')) return TOPICS.find(topic => topic.id === 'support');
  if (path.startsWith('/credentials')) return TOPICS.find(topic => topic.id === 'connections');
  if (path.startsWith('/marketplace') || path.startsWith('/templates')) return TOPICS.find(topic => topic.id === 'starter-kit');
  if (path.startsWith('/evaluations') || path.startsWith('/observability')) return TOPICS.find(topic => topic.id === 'testing');
  if (path.startsWith('/launch')) return TOPICS.find(topic => topic.id === 'launch');
  return {
    id:'fallback',
    title:'Tell me the outcome, not the technical setup',
    text:signedIn
      ? 'I can design a first workflow, explain any AgentForge page, troubleshoot a failed run, or tell you which connection is needed. Describe what happens today and what a successful result looks like.'
      : 'I can explain AgentForge in simple words, recommend a starter workflow, compare connection options, explain safety, or help you decide whether the platform fits your process.',
    bullets:['What starts the work?', 'What decision or content is needed?', 'What app receives the result, and should a person approve it?'],
    actions:[{ label:'Explore starter kits', path:'/templates' }, { label:signedIn ? 'Open dashboard' : 'Start free', path:signedIn ? '/dashboard' : '/signup' }],
    followUps:['Which workflow fits me?', 'How is AgentForge safe?'],
  };
}

export function answerSiteQuestion(question, { path = '/', signedIn = false } = {}) {
  const normalized = String(question || '').toLowerCase().trim();
  const words = normalizedWords(normalized);
  const ranked = TOPICS.map(topic => ({ topic, score:scoreTopic(topic, normalized, words) }))
    .sort((left, right) => right.score - left.score);
  const selected = ranked[0]?.score > 0 ? ranked[0].topic : fallbackFor(path, signedIn);
  return {
    ...selected,
    actions:(selected.actions || []).filter(action => !action.auth || signedIn).filter(action => !action.guest || !signedIn),
  };
}

export function contextSuggestions(path, signedIn) {
  if (path.startsWith('/credentials')) return ['What should I connect first?', 'How are credentials stored?', 'What integrations are live?'];
  if (path.startsWith('/marketplace') || path.startsWith('/templates')) return ['Which workflow fits me?', 'Tell me about support triage', 'How do approvals work?'];
  if (path.startsWith('/workflows')) return ['Agent vs workflow?', 'How do I test before publishing?', 'How do approvals work?'];
  if (path.startsWith('/launch')) return ['What should I check before launch?', 'How do I test a workflow?', 'How is AgentForge safe?'];
  return signedIn
    ? ['Explain this page simply', 'Design my first workflow', 'Help me fix a failed run']
    : ['What does AgentForge do?', 'Which workflow fits me?', 'Can I start free?'];
}
