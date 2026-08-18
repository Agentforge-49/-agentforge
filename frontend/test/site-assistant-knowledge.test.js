import assert from 'node:assert/strict'
import test from 'node:test'

import { answerSiteQuestion, contextSuggestions } from '../src/lib/site-assistant-knowledge.js'

test('site guide recommends the support starter for a support request', () => {
  const answer = answerSiteQuestion('I need to triage customer support tickets into Slack')
  assert.equal(answer.id, 'support')
  assert.match(answer.text, /approve/i)
})

test('signed-in support guidance opens the progressive launch cockpit', () => {
  const answer = answerSiteQuestion('How do I start support triage safely?', {
    signedIn:true,
    path:'/support-operations',
  })
  assert.equal(answer.id, 'support')
  assert.equal(answer.actions[0].path, '/support-operations')
})

test('site guide gives accurate free launch limits', () => {
  const answer = answerSiteQuestion('Can I start free without a credit card?')
  assert.equal(answer.id, 'pricing')
  assert.match(answer.text, /50 model calls/)
  assert.match(answer.text, /100K tokens/)
})

test('site guide hides protected actions from visitors', () => {
  const visitor = answerSiteQuestion('How do I connect Slack?', { signedIn:false })
  const member = answerSiteQuestion('How do I connect Slack?', { signedIn:true })
  assert(!visitor.actions.some(action => action.path === '/credentials'))
  assert(member.actions.some(action => action.path === '/credentials'))
})

test('site guide falls back to page-aware help', () => {
  const answer = answerSiteQuestion('xyzzy', { path:'/marketplace', signedIn:true })
  assert.equal(answer.id, 'starter-kit')
  assert(contextSuggestions('/credentials', true).some(item => /connect/i.test(item)))
})

test('site guide explains the product in simple words', () => {
  const answer = answerSiteQuestion('What does AgentForge do? Explain it in simple words.')
  assert.equal(answer.id, 'overview')
  assert.match(answer.text, /step-by-step workflow/i)
  assert.match(answer.text, /person can approve/i)
})

test('site guide gives a real troubleshooting path', () => {
  const answer = answerSiteQuestion('My app is not working and the connector failed', { signedIn:true })
  assert.equal(answer.id, 'troubleshooting')
  assert(answer.actions.some(action => action.path === '/observability'))
})
