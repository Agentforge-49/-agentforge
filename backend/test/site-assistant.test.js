import assert from 'node:assert/strict';
import test from 'node:test';

import { siteAssistantPrompt, suggestedAssistantPath } from '../lib/site-assistant.js';

test('account guide routes common requests to safe workspace pages', () => {
  assert.equal(suggestedAssistantPath('How do I connect Salesforce?'), '/credentials');
  assert.equal(suggestedAssistantPath('Why did my workflow fail?'), '/observability');
  assert.equal(suggestedAssistantPath('Create a webhook trigger'), '/triggers');
});

test('account guide prompt preserves honest integration boundaries', () => {
  const prompt = siteAssistantPrompt({ connections:{ providers:['slack'] } });
  assert.match(prompt, /Catalog presence never means native support/);
  assert.match(prompt, /Do not claim you performed an action/);
  assert(!prompt.includes('secret-value'));
});
