import fetch from 'node-fetch';

export async function executeAgent(agentConfig, userMessage) {
  const engineUrl = process.env.AGENT_ENGINE_URL?.replace(/\/+$/, '');
  if (!engineUrl) {
    throw new Error('AGENT_ENGINE_URL is not configured');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.ENGINE_API_KEY) {
    headers['X-AgentForge-Key'] = process.env.ENGINE_API_KEY;
  }

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
