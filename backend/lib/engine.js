import fetch from 'node-fetch';

function getEngineUrl() {
  const engineUrl = process.env.AGENT_ENGINE_URL?.replace(/\/+$/, '');
  if (!engineUrl) {
    throw new Error('AGENT_ENGINE_URL is not configured');
  }
  return engineUrl;
}

function getEngineHeaders() {
  const headers = {};
  if (process.env.ENGINE_API_KEY) {
    headers['X-AgentForge-Key'] = process.env.ENGINE_API_KEY;
  }
  return headers;
}

export async function executeAgent(agentConfig, userMessage) {
  const engineUrl = getEngineUrl();
  const headers = {
    'Content-Type': 'application/json',
    ...getEngineHeaders(),
  };

  const response = await fetch(`${engineUrl}/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      agent_config: agentConfig,
      user_message: userMessage,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Engine error (${response.status}): ${detail.slice(0, 500)}`);
  }

  return response.json();
}

export async function getEngineHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${getEngineUrl()}/health`, {
      headers: getEngineHeaders(),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Engine health check returned ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}
