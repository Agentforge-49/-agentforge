import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractWorkflowJson,
  normalizeWorkflowPlan,
  workflowCopilotPrompt,
} from '../lib/workflow-copilot.js';

const AGENT = {
  id:'11111111-1111-4111-8111-111111111111',
  name:'Research Agent',
  description:'Finds evidence',
  model:'claude-sonnet-4-6',
};
const CREDENTIAL = {
  id:'22222222-2222-4222-8222-222222222222',
  name:'Slack workspace',
  provider:'slack',
};

test('extracts a fenced JSON workflow without accepting prose as structure', () => {
  const parsed = extractWorkflowJson('```json\n{"name":"Research","steps":[{"type":"agent"}]}\n```');
  assert.equal(parsed.name, 'Research');
  assert.throws(() => extractWorkflowJson('Here is your workflow'), /JSON workflow/i);
  assert.throws(() => extractWorkflowJson('{bad json}'), /malformed/i);
});

test('normalizes an allowlisted workflow into a valid graph', () => {
  const plan = normalizeWorkflowPlan({
    name:'Research and approve',
    description:'Produce a reviewed brief.',
    steps:[
      { type:'agent', label:'Research', agent_id:AGENT.id },
      {
        type:'transform',
        label:'Format brief',
        operation:'template',
        template:'Brief:\n{{input}}',
      },
      {
        type:'approval',
        label:'Manager approval',
        instructions:'Confirm sources and claims.',
        timeout_minutes:120,
      },
    ],
    assumptions:['A published research agent exists.'],
  }, { agents:[AGENT] });

  assert.equal(plan.nodes.length, 5);
  assert.equal(plan.edges.length, 4);
  assert.deepEqual(plan.nodes.map(node => node.type), [
    'input', 'agent', 'transform', 'approval', 'output',
  ]);
  assert.equal(plan.nodes[1].config.agent_id, AGENT.id);
});

test('rejects hallucinated agents and connector credentials', () => {
  assert.throws(() => normalizeWorkflowPlan({
    name:'Unsafe',
    steps:[{ type:'agent', agent_id:'not-allowed' }],
  }, { agents:[AGENT] }), /published agent/i);

  assert.throws(() => normalizeWorkflowPlan({
    name:'Unsafe connector',
    steps:[{
      type:'connector',
      action:'slack.message',
      credential_id:'33333333-3333-4333-8333-333333333333',
      parameters:{ channel:'C1', text:'{{input}}' },
    }],
  }, { credentials:[CREDENTIAL] }), /compatible vault credential/i);
});

test('accepts a compatible connector credential and limits prompt exposure', () => {
  const plan = normalizeWorkflowPlan({
    name:'Notify',
    steps:[{
      type:'connector',
      action:'slack.message',
      credential_id:CREDENTIAL.id,
      parameters:{ channel:'C123', text:'{{input}}' },
    }],
  }, { credentials:[CREDENTIAL] });
  assert.equal(plan.nodes[1].config.credential_id, CREDENTIAL.id);

  const prompt = workflowCopilotPrompt({
    agents:[AGENT],
    credentials:[{ ...CREDENTIAL, secret:'must-never-appear' }],
    connectors:[{
      action:'slack.message',
      name:'Slack Message',
      providers:['slack'],
    }],
  });
  assert.match(prompt, /Slack workspace/);
  assert.doesNotMatch(prompt, /must-never-appear/);
});
