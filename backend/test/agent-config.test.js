import test from 'node:test';
import assert from 'node:assert/strict';

import {
  draftDefaults,
  validateAgentConfig,
  validateToolSlugs,
} from '../lib/agent-config.js';

test('valid published agent configuration is normalized', () => {
  const { value, errors } = validateAgentConfig({
    name: '  Researcher  ',
    description: '  Finds reliable sources. ',
    category: 'research',
    system_prompt: '  Research the request carefully.  ',
    personality: 'professional',
    model: 'claude-sonnet-4-6',
    temperature: '0.4',
    max_tokens: '1200',
  }, { forPublish: true });

  assert.deepEqual(errors, []);
  assert.equal(value.name, 'Researcher');
  assert.equal(value.description, 'Finds reliable sources.');
  assert.equal(value.system_prompt, 'Research the request carefully.');
  assert.equal(value.temperature, 0.4);
  assert.equal(value.max_tokens, 1200);
});

test('drafts may omit a prompt but publishing may not', () => {
  const config = draftDefaults({ name: 'Draft Agent' });
  assert.deepEqual(validateAgentConfig(config).errors, []);
  assert.match(
    validateAgentConfig(config, { forPublish: true }).errors.join(' '),
    /system prompt/i,
  );
});

test('unsupported models and invalid numeric controls are rejected', () => {
  const { errors } = validateAgentConfig({
    ...draftDefaults({ name: 'Invalid Agent' }),
    system_prompt: 'A valid system prompt.',
    model: 'gpt-4o',
    temperature: 2,
    max_tokens: 0,
  }, { forPublish: true });

  assert.equal(errors.length, 3);
});

test('tool slugs are normalized and deduplicated', () => {
  const { value, errors } = validateToolSlugs([
    'web_search',
    'web_search',
    'calculator',
  ]);

  assert.deepEqual(errors, []);
  assert.deepEqual(value, ['web_search', 'calculator']);
});

test('invalid tool identifiers are rejected', () => {
  const { errors } = validateToolSlugs(['web_search', 'Not Valid']);
  assert.match(errors.join(' '), /invalid tool identifier/i);
});
