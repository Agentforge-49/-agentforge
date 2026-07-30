export const AGENT_CATEGORIES = new Set([
  'research',
  'writing',
  'automation',
  'support',
  'data',
  'other',
]);

export const AGENT_PERSONALITIES = new Set([
  'professional',
  'friendly',
  'concise',
  'creative',
]);

import { SUPPORTED_MODELS } from './model-catalog.js';

export const AGENT_MODELS = SUPPORTED_MODELS;

const CONFIG_FIELDS = [
  'name',
  'description',
  'category',
  'system_prompt',
  'personality',
  'model',
  'temperature',
  'max_tokens',
];

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : value;
}

export function validateToolSlugs(input) {
  if (input === undefined) return { value: undefined, errors: [] };
  if (!Array.isArray(input)) {
    return { value: [], errors: ['tool_slugs must be an array'] };
  }

  const value = [...new Set(input.map(normalizeText).filter(Boolean))];
  const errors = [];

  if (value.some(slug => typeof slug !== 'string' || !/^[a-z0-9_]+$/.test(slug))) {
    errors.push('tool_slugs contains an invalid tool identifier');
  }
  if (value.length > 25) {
    errors.push('An agent can use at most 25 tools');
  }

  return { value, errors };
}

export function validateAgentConfig(input, { partial = false, forPublish = false } = {}) {
  const value = {};
  const errors = [];

  for (const field of CONFIG_FIELDS) {
    if (!partial || hasOwn(input, field)) value[field] = input[field];
  }

  if (!partial || hasOwn(value, 'name')) {
    value.name = normalizeText(value.name);
    if (typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 80) {
      errors.push('Name must be between 1 and 80 characters');
    }
  }

  if (!partial || hasOwn(value, 'description')) {
    value.description = normalizeText(value.description ?? '');
    if (typeof value.description !== 'string' || value.description.length > 500) {
      errors.push('Description must be 500 characters or fewer');
    }
  }

  if (!partial || hasOwn(value, 'category')) {
    value.category = normalizeText(value.category);
    if (!AGENT_CATEGORIES.has(value.category)) {
      errors.push('Category is not supported');
    }
  }

  if (!partial || hasOwn(value, 'system_prompt')) {
    value.system_prompt = normalizeText(value.system_prompt ?? '');
    if (typeof value.system_prompt !== 'string' || value.system_prompt.length > 12000) {
      errors.push('System prompt must be 12,000 characters or fewer');
    } else if (forPublish && value.system_prompt.length < 10) {
      errors.push('A published agent needs a system prompt of at least 10 characters');
    }
  }

  if (!partial || hasOwn(value, 'personality')) {
    value.personality = normalizeText(value.personality);
    if (!AGENT_PERSONALITIES.has(value.personality)) {
      errors.push('Personality is not supported');
    }
  }

  if (!partial || hasOwn(value, 'model')) {
    value.model = normalizeText(value.model);
    if (!AGENT_MODELS.has(value.model)) {
      errors.push('Model is not supported by the current agent engine');
    }
  }

  if (!partial || hasOwn(value, 'temperature')) {
    value.temperature = Number(value.temperature);
    if (!Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 1) {
      errors.push('Temperature must be between 0 and 1');
    }
  }

  if (!partial || hasOwn(value, 'max_tokens')) {
    value.max_tokens = Number(value.max_tokens);
    if (!Number.isInteger(value.max_tokens) || value.max_tokens < 1 || value.max_tokens > 8192) {
      errors.push('Max tokens must be an integer between 1 and 8192');
    }
  }

  return { value, errors };
}

export function draftDefaults(input) {
  return {
    name: input.name,
    description: input.description ?? '',
    category: input.category ?? 'other',
    system_prompt: input.system_prompt ?? '',
    personality: input.personality ?? 'professional',
    model: input.model ?? 'claude-sonnet-4-6',
    temperature: input.temperature ?? 0.7,
    max_tokens: input.max_tokens ?? 1000,
  };
}
