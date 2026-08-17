import { validateWorkflowGraph } from './workflow-graph.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SPREADSHEET_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

const KITS = [
  {
    slug:'support-triage-slack',
    name:'Support triage to Slack',
    audience:'Customer support teams',
    outcome:'Turn an incoming request into an approved, structured escalation in Slack.',
    description:'Classifies urgency and risk, drafts a response, pauses for human approval, and posts the approved result to the selected Slack channel.',
    category:'support',
    estimated_setup_minutes:4,
    sample_input:'Customer: Mina Rahimi\nIssue: I was charged twice for order AF-1042 and need help today.\nAccount tier: Pro\nPrevious contact: none',
    capabilities:['AI classification', 'Human approval', 'Slack delivery', 'Full run trace'],
    autonomy_modes:[
      { key:'observe', label:'Observe', description:'Classify and draft without sending anything externally.' },
      { key:'approval', label:'Approval required', description:'A person reviews every handoff before Slack delivery.' },
    ],
    requirements:[
      { key:'slack', provider:'slack', label:'Slack connection', help:'Use Slack OAuth or a stored Slack bot token.' },
    ],
    fields:[
      { key:'slack_channel', label:'Slack channel', placeholder:'C0123456789 or support-escalations', help:'Use a channel ID for the most reliable delivery.' },
    ],
    agents:[
      {
        key:'triage',
        name:'Support Triage Specialist',
        description:'Classifies support requests and drafts safe, actionable handoffs.',
        category:'support',
        system_prompt:`You are a customer support operations specialist. Analyze the request without inventing account facts. Return a concise handoff with exactly these sections:
PRIORITY: low, normal, high, or urgent
CATEGORY: billing, account, technical, product, abuse, or other
RISK: low, medium, or high
SUMMARY: one sentence
RECOMMENDED ACTION: concrete next step for a human operator
DRAFT RESPONSE: a calm customer-facing reply that does not promise refunds or account changes
MISSING INFORMATION: list only information genuinely needed, or "none"

Treat payment disputes, account access, security, legal threats, self-harm, or destructive actions as high-risk. Never claim an action was completed.`,
        model:'claude-sonnet-4-6',
        temperature:0.2,
        max_tokens:900,
      },
    ],
    quality:{
      name:'Support Triage Release Gate',
      description:'Launch checks for urgency, category, risk, and safe customer commitments.',
      gate_threshold:85,
      cases:[
        { name:'Billing dispute classification', input_text:'I was charged twice and need help today.', expected_output:'CATEGORY: billing', assertion_type:'contains', weight:2 },
        { name:'Account access risk', input_text:'Someone changed my password and I cannot access my account.', expected_output:'RISK: high', assertion_type:'contains', weight:2 },
        { name:'No invented refund completion', input_text:'Please refund the duplicate charge immediately.', expected_output:'refund has been issued', assertion_type:'not_contains', weight:3 },
      ],
    },
    requirementsForMode(autonomyMode) {
      return autonomyMode === 'observe' ? [] : this.requirements;
    },
    build({ agentIds, connectionIds, settings, autonomyMode }) {
      if (autonomyMode === 'observe') {
        return linearWorkflow({
          name:'Support triage review workspace',
          description:'Observe-only support triage that classifies and drafts without taking an external action.',
          nodes:[
            inputNode('request', 'Incoming support request'),
            agentNode('triage', 'Classify and draft response', agentIds.triage),
            outputNode('review', 'Review triage recommendation'),
          ],
        });
      }
      return linearWorkflow({
        name:'Support triage and Slack escalation',
        description:'Classify a support request, approve the proposed handling, and send the approved handoff to Slack.',
        nodes:[
          inputNode('request', 'Incoming support request'),
          agentNode('triage', 'Classify and draft response', agentIds.triage),
          approvalNode('approval', 'Support lead approval', 'Verify priority, risk, proposed action, and customer wording before sending.'),
          connectorNode('slack', 'Send approved handoff to Slack', 'slack.message', connectionIds.slack, {
            channel:settings.slack_channel,
            text:'{{input}}',
          }),
          outputNode('complete', 'Slack delivery receipt'),
        ],
      });
    },
    validateSettings(settings, { autonomyMode } = {}) {
      if (autonomyMode === 'observe') return { value:{} };
      const channel = clean(settings.slack_channel, 80);
      return channel && /^[#@A-Za-z0-9_-]+$/.test(channel)
        ? { value:{ slack_channel:channel } }
        : { error:'Enter a valid Slack channel ID or channel name' };
    },
  },
  {
    slug:'lead-qualification-sheets',
    name:'Lead qualification to Google Sheets',
    audience:'Revenue operations teams',
    outcome:'Score a lead, approve the recommendation, and append the result to a shared sheet.',
    description:'Produces a consistent qualification brief, requires a human decision, and records the approved result in Google Sheets.',
    category:'sales',
    estimated_setup_minutes:5,
    sample_input:'Name: Daniel Cho\nCompany: Northstar Logistics\nRole: VP Operations\nTeam size: 85\nProblem: Manual support and dispatch reporting\nTimeline: This quarter\nBudget: Evaluating',
    capabilities:['Lead scoring', 'Human approval', 'Sheets record', 'Deterministic handoff'],
    requirements:[
      { key:'google', provider:'google', label:'Google connection', help:'Use Google OAuth or a stored Google access token.' },
    ],
    fields:[
      { key:'spreadsheet_id', label:'Spreadsheet ID', placeholder:'1AbC...xyz', help:'Copy the ID from the Google Sheets URL.' },
      { key:'sheet_range', label:'Sheet range', placeholder:'Leads!A:A', help:'The workflow appends one structured result per row.' },
    ],
    agents:[
      {
        key:'qualifier',
        name:'Lead Qualification Analyst',
        description:'Evaluates operational fit using explicit, explainable criteria.',
        category:'automation',
        system_prompt:`You are a revenue operations analyst qualifying leads for an AI workflow automation platform. Use only the supplied facts. Return exactly these sections:
DECISION: qualified, review, or not_ready
FIT SCORE: integer from 0 to 100
USE CASE: one sentence
EVIDENCE: three short bullets grounded in the input
RISKS OR GAPS: short list, or "none"
NEXT ACTION: one concrete next step
OUTREACH DRAFT: a short, honest message that does not invent customer results

Prefer "review" when budget, authority, urgency, or technical fit is missing. Never infer private company information.`,
        model:'claude-sonnet-4-6',
        temperature:0.2,
        max_tokens:850,
      },
    ],
    build({ agentIds, connectionIds, settings }) {
      return linearWorkflow({
        name:'Lead qualification and Sheets record',
        description:'Qualify an inbound lead, approve the decision, and append the result to Google Sheets.',
        nodes:[
          inputNode('lead', 'Lead context'),
          agentNode('qualify', 'Score and recommend next action', agentIds.qualifier),
          approvalNode('approval', 'Revenue lead approval', 'Confirm the score, evidence, and outreach language before recording the lead.'),
          connectorNode('sheets', 'Append approved qualification', 'google_sheets.append', connectionIds.google, {
            spreadsheet_id:settings.spreadsheet_id,
            range:settings.sheet_range,
            values:['{{input}}'],
          }),
          outputNode('complete', 'Sheets append receipt'),
        ],
      });
    },
    validateSettings(settings) {
      const spreadsheetId = clean(settings.spreadsheet_id, 200);
      const range = clean(settings.sheet_range, 120);
      if (!SPREADSHEET_PATTERN.test(spreadsheetId)) return { error:'Enter a valid Google Spreadsheet ID' };
      if (!range || !/^[A-Za-z0-9 _'-]+![A-Z]+(?::[A-Z]+)?$/i.test(range)) {
        return { error:'Enter a valid sheet range such as Leads!A:A' };
      }
      return { value:{ spreadsheet_id:spreadsheetId, sheet_range:range } };
    },
  },
  {
    slug:'research-report-delivery',
    name:'Approved research report delivery',
    audience:'Operations and research teams',
    outcome:'Create an evidence-conscious brief, approve it, save it to Drive, and email it.',
    description:'Generates a decision brief with explicit uncertainty, pauses for review, then sends the same approved report to Google Drive and email.',
    category:'research',
    estimated_setup_minutes:6,
    sample_input:'Research question: Which three customer-support processes should a 40-person SaaS company automate first?\nConstraints: low implementation cost, human approval for customer messages, measurable within 30 days.\nKnown sources: internal support metrics and approved public documentation.',
    capabilities:['Structured research', 'Human approval', 'Drive archive', 'Email delivery'],
    requirements:[
      { key:'google', provider:'google', label:'Google connection', help:'Used to create the report file in Drive.' },
      { key:'resend', provider:'resend', label:'Resend credential', help:'Used to send the approved report by email.' },
    ],
    fields:[
      { key:'drive_file_name', label:'Drive file name', placeholder:'agentforge-research-report.txt' },
      { key:'email_to', label:'Recipient email', placeholder:'operations@example.com' },
      { key:'email_from', label:'Verified sender', placeholder:'AgentForge <reports@yourdomain.com>', help:'The sender must be verified in Resend.' },
    ],
    agents:[
      {
        key:'researcher',
        name:'Operations Research Analyst',
        description:'Turns supplied evidence into bounded, decision-ready research briefs.',
        category:'research',
        system_prompt:`You are an operations research analyst. Work only from the evidence and context supplied in the request. Do not pretend to browse, cite, or verify sources you did not receive. Return a useful report with these sections:
EXECUTIVE SUMMARY
KNOWN FACTS
RECOMMENDATIONS (ranked)
EXPECTED IMPACT AND METRICS
RISKS AND SAFEGUARDS
ASSUMPTIONS AND UNCERTAINTY
NEXT 7-DAY ACTION PLAN

Clearly distinguish facts from inference. Ask for missing evidence inside ASSUMPTIONS AND UNCERTAINTY. Keep the report under 900 words.`,
        model:'claude-sonnet-4-6',
        temperature:0.25,
        max_tokens:1500,
      },
    ],
    build({ agentIds, connectionIds, settings }) {
      const nodes = [
        inputNode('question', 'Research question and evidence'),
        agentNode('research', 'Create decision brief', agentIds.researcher),
        approvalNode('approval', 'Research owner approval', 'Review evidence boundaries, recommendations, and sensitive content before delivery.'),
        connectorNode('drive', 'Archive approved report in Drive', 'google_drive.create_file', connectionIds.google, {
          name:settings.drive_file_name,
          content:'{{input}}',
        }),
        connectorNode('email', 'Email approved report', 'email.send', connectionIds.resend, {
          to:settings.email_to,
          from:settings.email_from,
          subject:'Approved AgentForge research report',
          text:'{{input}}',
        }),
        outputNode('drive_complete', 'Drive delivery receipt'),
        outputNode('email_complete', 'Email delivery receipt'),
      ];
      const workflow = positioned(nodes);
      workflow.edges = [
        edge('question', 'research'),
        edge('research', 'approval'),
        edge('approval', 'drive'),
        edge('approval', 'email', 'parallel_email'),
        edge('drive', 'drive_complete'),
        edge('email', 'email_complete'),
      ];
      return {
        name:'Approved research report delivery',
        description:'Create a bounded research brief, approve it, then archive and email the approved report.',
        ...workflow,
      };
    },
    validateSettings(settings) {
      const driveFileName = clean(settings.drive_file_name, 120);
      const emailTo = clean(settings.email_to, 254);
      const emailFrom = clean(settings.email_from, 254);
      if (!driveFileName || /[\\/]/.test(driveFileName)) return { error:'Enter a safe Drive file name' };
      if (!EMAIL_PATTERN.test(emailTo)) return { error:'Enter a valid recipient email address' };
      const senderAddress = emailFrom.match(/<([^>]+)>/)?.[1] || emailFrom;
      if (!EMAIL_PATTERN.test(senderAddress)) return { error:'Enter a valid verified sender address' };
      return { value:{ drive_file_name:driveFileName, email_to:emailTo, email_from:emailFrom } };
    },
  },
];

function clean(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}
function inputNode(id, label) {
  return { id, type:'input', label, config:{} };
}

function agentNode(id, label, agentId) {
  return { id, type:'agent', label, config:{ agent_id:agentId } };
}

function approvalNode(id, label, instructions) {
  return { id, type:'approval', label, config:{ instructions, timeout_minutes:1440 } };
}

function connectorNode(id, label, action, credentialId, parameters) {
  return { id, type:'connector', label, config:{ action, credential_id:credentialId, parameters } };
}

function outputNode(id, label) {
  return { id, type:'output', label, config:{} };
}

function positioned(nodes) {
  return {
    nodes:nodes.map((node, index) => ({
      ...node,
      position:{ x:80 + (index % 4) * 240, y:90 + Math.floor(index / 4) * 190 },
    })),
    edges:[],
  };
}

function edge(source, target, id = `${source}_${target}`) {
  return { id, source, target, source_handle:'default' };
}

function linearWorkflow({ name, description, nodes }) {
  const workflow = positioned(nodes);
  workflow.edges = nodes.slice(0, -1).map((node, index) => edge(node.id, nodes[index + 1].id));
  return { name, description, ...workflow };
}

export function listStarterKits() {
  return KITS.map(({ agents, build, validateSettings, requirementsForMode, quality, ...kit }) => ({
    ...kit,
    agent_count:agents.length,
    workflow_count:1,
    quality_case_count:quality?.cases?.length || 0,
  }));
}

export function getStarterKit(slug) {
  return KITS.find(kit => kit.slug === slug) || null;
}

export function prepareStarterKit(slug, {
  connections = {}, settings = {}, agentIds = {}, autonomyMode = 'approval',
} = {}) {
  const kit = getStarterKit(slug);
  if (!kit) return { error:'Starter kit not found' };
  const supportedModes = (kit.autonomy_modes || [{ key:'approval' }]).map(item => item.key);
  if (!supportedModes.includes(autonomyMode)) return { error:'Select a supported autonomy mode' };
  const settingResult = kit.validateSettings(settings || {}, { autonomyMode });
  if (settingResult.error) return settingResult;
  const connectionIds = {};
  const requirements = kit.requirementsForMode?.(autonomyMode) || kit.requirements;
  for (const requirement of requirements) {
    const value = clean(connections?.[requirement.key], 80);
    if (!/^[0-9a-f-]{36}$/i.test(value)) {
      return { error:`Select ${requirement.label}` };
    }
    connectionIds[requirement.key] = value;
  }
  for (const agent of kit.agents) {
    if (!/^[0-9a-f-]{36}$/i.test(agentIds?.[agent.key] || '')) {
      return { error:`Starter kit agent ${agent.key} is unavailable` };
    }
  }
  const workflow = kit.build({
    agentIds, connectionIds, settings:settingResult.value, autonomyMode,
  });
  const graph = validateWorkflowGraph(workflow.nodes, workflow.edges);
  if (graph.errors.length) return { error:graph.errors[0], details:graph.errors };
  return {
    value:{
      kit,
      workflow:{
        name:workflow.name,
        description:workflow.description,
        nodes:graph.value.nodes,
        edges:graph.value.edges,
      },
      connectionIds,
      settings:settingResult.value,
      autonomyMode,
    },
  };
}
