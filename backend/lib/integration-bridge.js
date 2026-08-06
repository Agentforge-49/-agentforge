let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

export function integrationBridgeConfig(env = process.env) {
  const clientId = String(env.PIPEDREAM_CLIENT_ID || '').trim();
  const clientSecret = String(env.PIPEDREAM_CLIENT_SECRET || '').trim();
  const projectId = String(env.PIPEDREAM_PROJECT_ID || '').trim();
  const environment = env.PIPEDREAM_ENVIRONMENT === 'production' ? 'production' : 'development';
  return {
    configured:Boolean(clientId && clientSecret && /^proj_[A-Za-z0-9]+$/.test(projectId)),
    clientId,
    clientSecret,
    projectId,
    environment,
  };
}

export function normalizeIntegrationSlug(value) {
  const slug = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-z0-9][a-z0-9_-]{0,99}$/.test(slug) ? slug : null;
}

export function connectLinkForApp(connectLinkUrl, appSlug) {
  const link = new URL(connectLinkUrl);
  link.searchParams.set('app', appSlug);
  return link.toString();
}

async function responsePayload(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { error:text.slice(0, 300) }; }
}

async function accessToken(config, fetchImpl) {
  if (cachedAccessToken && cachedAccessTokenExpiresAt > Date.now() + 60_000) {
    return cachedAccessToken;
  }
  const response = await fetchImpl('https://api.pipedream.com/v1/oauth/token', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({
      grant_type:'client_credentials',
      client_id:config.clientId,
      client_secret:config.clientSecret,
      scope:'connect:tokens:create',
    }),
  });
  const payload = await responsePayload(response);
  if (!response.ok || !payload.access_token) {
    const error = new Error('External app bridge authorization failed');
    error.status = 502;
    throw error;
  }
  cachedAccessToken = payload.access_token;
  cachedAccessTokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000;
  return cachedAccessToken;
}

export async function createIntegrationConnectLink({
  userId,
  appSlug,
  frontendUrl,
  env = process.env,
  fetchImpl = fetch,
}) {
  const config = integrationBridgeConfig(env);
  if (!config.configured) {
    const error = new Error('The managed app bridge needs a Pipedream development project before account connections can open');
    error.status = 503;
    throw error;
  }
  const slug = normalizeIntegrationSlug(appSlug);
  if (!slug) {
    const error = new Error('Choose a valid app from the integration catalog');
    error.status = 400;
    throw error;
  }
  const origin = new URL(frontendUrl).origin;
  const token = await accessToken(config, fetchImpl);
  const response = await fetchImpl(
    `https://api.pipedream.com/v1/connect/${config.projectId}/tokens`,
    {
      method:'POST',
      headers:{
        Authorization:`Bearer ${token}`,
        'Content-Type':'application/json',
        'x-pd-environment':config.environment,
      },
      body:JSON.stringify({
        external_user_id:userId,
        allowed_origins:[origin],
        expires_in:900,
        scope:'connect:accounts:read connect:accounts:write connect:proxy',
        success_redirect_uri:`${origin}/apps?bridge=connected&app=${encodeURIComponent(slug)}`,
        error_redirect_uri:`${origin}/apps?bridge=error&app=${encodeURIComponent(slug)}`,
      }),
    },
  );
  const payload = await responsePayload(response);
  if (!response.ok || !payload.connect_link_url) {
    const error = new Error('The external app connection could not be started');
    error.status = 502;
    throw error;
  }
  return {
    app:slug,
    connect_url:connectLinkForApp(payload.connect_link_url, slug),
    expires_at:payload.expires_at,
    environment:config.environment,
  };
}
