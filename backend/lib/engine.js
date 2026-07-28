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

export async function executeAgent(agentConfig, userMessage, options = {}) {
  const engineUrl = getEngineUrl();
  const controller = new AbortController();
  const timeoutMs = Math.max(5000, (options.timeoutSeconds || 90) * 1000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    'Content-Type': 'application/json',
    ...getEngineHeaders(),
  };

  try {
    const response = await fetch(`${engineUrl}/execute`, {
      method: 'POST',
      headers,
      signal: controller.signal,
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
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Execution exceeded ${Math.round(timeoutMs / 1000)} seconds`);
      timeoutError.code = 'EXECUTION_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
