import assert from 'node:assert/strict';
import test from 'node:test';

import { getStarterKit, listStarterKits, prepareStarterKit } from '../lib/starter-kits.js';

const IDS = {
  agent:'11111111-1111-4111-8111-111111111111',
  slack:'22222222-2222-4222-8222-222222222222',
  google:'33333333-3333-4333-8333-333333333333',
  resend:'44444444-4444-4444-8444-444444444444',
};

test('flagship starter-kit catalog exposes three safe install contracts', () => {
  const kits = listStarterKits();
  assert.equal(kits.length, 3);
  assert.deepEqual(kits.map(item => item.slug), [
    'support-triage-slack',
    'lead-qualification-sheets',
    'research-report-delivery',
  ]);
  assert(kits.every(item => item.sample_input && item.requirements.length));
  assert(kits.every(item => !Object.hasOwn(item, 'agents')));
  assert(kits.every(item => !Object.hasOwn(item, 'build')));
  assert.equal(kits[0].quality_case_count, 3);
  assert.deepEqual(kits[0].autonomy_modes.map(item => item.key), ['observe', 'approval']);
});
test('support starter kit creates an approval-gated Slack workflow', () => {
  const result = prepareStarterKit('support-triage-slack', {
    connections:{ slack:IDS.slack },
    settings:{ slack_channel:'C0123456789' },
    agentIds:{ triage:IDS.agent },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.workflow.nodes.find(item => item.type === 'approval').config.timeout_minutes, 1440);
  assert.equal(result.value.workflow.nodes.find(item => item.id === 'slack').config.credential_id, IDS.slack);
  assert.equal(result.value.workflow.nodes.at(-1).type, 'output');
});

test('support starter kit can begin in observe mode without external delivery', () => {
  const result = prepareStarterKit('support-triage-slack', {
    settings:{},
    agentIds:{ triage:IDS.agent },
    autonomyMode:'observe',
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.autonomyMode, 'observe');
  assert.equal(result.value.workflow.nodes.some(item => item.type === 'approval'), false);
  assert.equal(result.value.workflow.nodes.some(item => item.type === 'connector'), false);
  assert.match(result.value.workflow.description, /without taking an external action/i);
});

test('support starter kit rejects an unqualified autonomous mode', () => {
  const result = prepareStarterKit('support-triage-slack', {
    settings:{},
    agentIds:{ triage:IDS.agent },
    autonomyMode:'autonomous',
  });
  assert.match(result.error, /supported autonomy mode/i);
});

test('lead starter kit validates spreadsheet configuration', () => {
  const invalid = prepareStarterKit('lead-qualification-sheets', {
    connections:{ google:IDS.google },
    settings:{ spreadsheet_id:'short', sheet_range:'Leads!A:A' },
    agentIds:{ qualifier:IDS.agent },
  });
  assert.match(invalid.error, /Spreadsheet ID/i);

  const valid = prepareStarterKit('lead-qualification-sheets', {
    connections:{ google:IDS.google },
    settings:{ spreadsheet_id:'1AbCdEfGhIjKlMnOp', sheet_range:'Qualified Leads!A:A' },
    agentIds:{ qualifier:IDS.agent },
  });
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.workflow.nodes.find(item => item.id === 'sheets').config.action, 'google_sheets.append');
});

test('research starter kit delivers the same approved report to Drive and email branches', () => {
  const kit = getStarterKit('research-report-delivery');
  assert.equal(kit.requirements.length, 2);
  const result = prepareStarterKit(kit.slug, {
    connections:{ google:IDS.google, resend:IDS.resend },
    settings:{
      drive_file_name:'weekly-operations-report.txt',
      email_to:'ops@example.com',
      email_from:'AgentForge <reports@example.com>',
    },
    agentIds:{ researcher:IDS.agent },
  });
  assert.equal(result.error, undefined);
  const approvalEdges = result.value.workflow.edges.filter(item => item.source === 'approval');
  assert.deepEqual(new Set(approvalEdges.map(item => item.target)), new Set(['drive', 'email']));
  assert.equal(result.value.workflow.nodes.filter(item => item.type === 'output').length, 2);
});
