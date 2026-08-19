import assert from 'node:assert/strict';
import test from 'node:test';

import { plainAssistantText, siteAssistantPrompt, suggestedAssistantPath } from '../lib/site-assistant.js';

test('account guide routes common requests to safe workspace pages', () => {
  assert.equal(suggestedAssistantPath('How do I connect Salesforce?'), '/credentials');
  assert.equal(suggestedAssistantPath('Why did my workflow fail?'), '/observability');
  assert.equal(suggestedAssistantPath('Create a webhook trigger'), '/triggers');
});

test('account guide prompt preserves honest integration boundaries', () => {
  const prompt = siteAssistantPrompt({ connections:{ providers:['slack'] } });
  assert.match(prompt, /Exactly 100 curated app connections/);
  assert.match(prompt, /Do not describe universal connections as typed native actions/);
  assert.match(prompt, /Do not claim you performed an action/);
  assert.match(prompt, /Return plain text only/);
  assert.match(prompt, /exact workspace labels/);
  assert(!prompt.includes('secret-value'));
});

test('account guide removes unsupported markdown decoration', () => {
  assert.equal(
    plainAssistantText('## Next step\nOpen **Apps** and choose [Slack](/apps). Use `Test connection`.'),
    'Next step\nOpen Apps and choose Slack. Use Test connection.',
  );
});
