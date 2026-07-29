import crypto from 'node:crypto';

export function normalizeKeywords(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(values
    .map(item => String(item).trim().toLowerCase())
    .filter(item => item.length >= 2 && item.length <= 50))]
    .slice(0, 25);
}

export function validateMultiAgentSystem(body, { partial = false } = {}) {
  const errors = [];
  const value = {};
  const text = (name, max, required = false) => {
    if (partial && body?.[name] === undefined) return;
    const clean = typeof body?.[name] === 'string' ? body[name].trim() : '';
    if ((required && !clean) || clean.length > max) {
      errors.push(`${name.replaceAll('_', ' ')} must be ${required ? 'between 1 and' : ''} ${max} characters or fewer`);
    }
    value[name] = clean || null;
  };
  text('name', 100, true);
  text('description', 500);
  text('supervisor_prompt', 4000);

  const enumField = (name, values, fallback) => {
    if (partial && body?.[name] === undefined) return;
    value[name] = body?.[name] || fallback;
    if (!values.includes(value[name])) errors.push(`${name.replaceAll('_', ' ')} is invalid`);
  };
  enumField('strategy', ['router', 'parallel', 'supervisor'], 'router');
  enumField('aggregation_strategy', ['concatenate', 'vote', 'supervisor'], 'concatenate');

  const integerField = (name, minimum, maximum, fallback) => {
    if (partial && body?.[name] === undefined) return;
    value[name] = Number(body?.[name] ?? fallback);
    if (!Number.isInteger(value[name]) || value[name] < minimum || value[name] > maximum) {
      errors.push(`${name.replaceAll('_', ' ')} must be between ${minimum} and ${maximum}`);
    }
  };
  integerField('max_delegations', 1, 20, 6);
  integerField('max_parallel', 1, 8, 3);
  integerField('max_depth', 1, 5, 2);
  integerField('timeout_seconds', 15, 900, 180);

  if (!partial || body?.supervisor_agent_id !== undefined) {
    value.supervisor_agent_id = body?.supervisor_agent_id || null;
  }
  if (!partial || body?.members !== undefined) {
    if (!Array.isArray(body?.members) || body.members.length < 1 || body.members.length > 8) {
      errors.push('Choose between 1 and 8 worker agents');
      value.members = [];
    } else {
      const seen = new Set();
      value.members = body.members.map((member, index) => {
        const agentId = String(member?.agent_id || '').trim();
        if (!/^[0-9a-f-]{36}$/i.test(agentId)) errors.push('Every worker must have a valid agent');
        if (seen.has(agentId)) errors.push('Worker agents cannot be duplicated');
        seen.add(agentId);
        return {
          agent_id:agentId,
          role:member?.role === 'specialist' ? 'specialist' : 'worker',
          route_keywords:normalizeKeywords(member?.route_keywords),
          position:index,
        };
      });
    }
  }
  const strategy = value.strategy ?? body?.strategy;
  const aggregation = value.aggregation_strategy ?? body?.aggregation_strategy;
  const supervisorId = value.supervisor_agent_id ?? body?.supervisor_agent_id;
  const delegationLimit = value.max_delegations ?? Number(body?.max_delegations);
  if ((strategy === 'supervisor' || aggregation === 'supervisor') && !supervisorId) {
    errors.push('A supervisor agent is required for supervisor routing or aggregation');
  }
  if (strategy === 'supervisor' && delegationLimit < 2) {
    errors.push('Supervisor routing requires at least 2 delegations');
  }
  return { errors, value };
}

export function selectRouterMember(members, input) {
  const terms = String(input || '').toLowerCase();
  const scored = [...members].map(member => ({
    member,
    score:(member.route_keywords || []).reduce(
      (total, keyword) => total + (terms.includes(String(keyword).toLowerCase()) ? 1 : 0),
      0,
    ),
  })).sort((left, right) => (
    right.score - left.score
    || left.member.position - right.member.position
    || left.member.agent_id.localeCompare(right.member.agent_id)
  ));
  return {
    member:scored[0]?.member || null,
    reason:scored[0]?.score
      ? `Matched ${scored[0].score} routing keyword(s)`
      : 'Defaulted to the first worker',
  };
}

export function selectParallelMembers(members, maxParallel, maxDelegations) {
  return [...members]
    .sort((left, right) => left.position - right.position)
    .slice(0, Math.max(1, Math.min(maxParallel, maxDelegations)));
}

export function taskSignature(agentId, input, depth, purpose = 'work') {
  const normalizedInput = String(input || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return crypto
    .createHash('sha256')
    .update(`${agentId}:${depth}:${purpose}:${normalizedInput}`)
    .digest('hex');
}

export function aggregateOutputs(strategy, outputs) {
  const completed = outputs.filter(item => item?.output);
  if (!completed.length) return '';
  if (strategy === 'vote') {
    const counts = new Map();
    for (const item of completed) {
      const key = item.output.trim().replace(/\s+/g, ' ').toLowerCase();
      const existing = counts.get(key);
      counts.set(key, {
        count:(existing?.count || 0) + 1,
        output:existing?.output || item.output,
      });
    }
    return [...counts.values()].sort((left, right) => right.count - left.count)[0].output;
  }
  return completed.map((item, index) => (
    `Worker ${index + 1} (${item.agentName || item.agentId}):\n${item.output}`
  )).join('\n\n');
}

export function parseSupervisorRoute(rawOutput, members, maxParallel, remainingDelegations) {
  const match = String(rawOutput || '').match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    const allowed = new Set(members.map(member => member.agent_id));
    return [...new Set(parsed.selected_agent_ids || [])]
      .filter(id => allowed.has(id))
      .slice(0, Math.min(maxParallel, remainingDelegations))
      .map(agentId => ({
        agentId,
        instructions:typeof parsed.instructions?.[agentId] === 'string'
          ? parsed.instructions[agentId].slice(0, 5000) : null,
      }));
  } catch {
    return [];
  }
}
