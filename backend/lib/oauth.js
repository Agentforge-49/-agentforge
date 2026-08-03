import crypto from 'node:crypto';

export const OAUTH_PROVIDERS = Object.freeze({
  google:{
    label:'Google Workspace',
    authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl:'https://oauth2.googleapis.com/token',
    profileUrl:'https://openidconnect.googleapis.com/v1/userinfo',
    clientIdEnv:'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnv:'GOOGLE_OAUTH_CLIENT_SECRET',
    scopes:[
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  },
  slack:{
    label:'Slack',
    authorizationUrl:'https://slack.com/oauth/v2/authorize',
    tokenUrl:'https://slack.com/api/oauth.v2.access',
    profileUrl:'https://slack.com/api/auth.test',
    clientIdEnv:'SLACK_OAUTH_CLIENT_ID',
    clientSecretEnv:'SLACK_OAUTH_CLIENT_SECRET',
    scopes:['chat:write', 'channels:read', 'users:read'],
  },
  github:{
    label:'GitHub',
    authorizationUrl:'https://github.com/login/oauth/authorize',
    tokenUrl:'https://github.com/login/oauth/access_token',
    profileUrl:'https://api.github.com/user',
    clientIdEnv:'GITHUB_OAUTH_CLIENT_ID',
    clientSecretEnv:'GITHUB_OAUTH_CLIENT_SECRET',
    scopes:['read:user', 'user:email'],
  },
});

function configurationError(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

function stateSecret() {
  const value = process.env.OAUTH_STATE_SECRET || '';
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw configurationError('OAuth state signing is not configured');
  }
  return value;
}

export function oauthProvider(provider) {
  const definition = OAUTH_PROVIDERS[provider];
  if (!definition) {
    const error = new Error('OAuth provider is not supported');
    error.status = 404;
    throw error;
  }
  return definition;
}

export function oauthProviderStatus(provider) {
  const definition = oauthProvider(provider);
  return {
    provider,
    label:definition.label,
    configured:Boolean(
      process.env[definition.clientIdEnv]
      && process.env[definition.clientSecretEnv]
      && process.env.OAUTH_STATE_SECRET,
    ),
    scopes:definition.scopes,
  };
}

export function createOauthState({ userId, provider, nonce, expiresAt }) {
  const payload = Buffer.from(JSON.stringify({
    sub:userId,
    provider,
    nonce,
    exp:Math.floor(new Date(expiresAt).getTime() / 1000),
  })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', stateSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyOauthState(state) {
  const [payload, signature, extra] = String(state || '').split('.');
  if (!payload || !signature || extra) throw new Error('OAuth state is invalid');
  const expected = crypto
    .createHmac('sha256', stateSecret())
    .update(payload)
    .digest();
  let supplied;
  try {
    supplied = Buffer.from(signature, 'base64url');
  } catch {
    throw new Error('OAuth state is invalid');
  }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    throw new Error('OAuth state is invalid');
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('OAuth state is invalid');
  }
  if (
    typeof parsed.sub !== 'string'
    || typeof parsed.provider !== 'string'
    || typeof parsed.nonce !== 'string'
    || !Number.isInteger(parsed.exp)
    || parsed.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error('OAuth state has expired or is invalid');
  }
  oauthProvider(parsed.provider);
  return parsed;
}

export function hashOauthNonce(nonce) {
  return crypto.createHash('sha256').update(String(nonce)).digest('hex');
}

export function buildAuthorizationUrl(provider, state, redirectUri) {
  const definition = oauthProvider(provider);
  const clientId = process.env[definition.clientIdEnv];
  const clientSecret = process.env[definition.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw configurationError(`${definition.label} OAuth is not configured`);
  }
  const url = new URL(definition.authorizationUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  if (provider === 'slack') {
    url.searchParams.set('scope', definition.scopes.join(','));
  } else {
    url.searchParams.set('scope', definition.scopes.join(' '));
  }
  if (provider === 'google') {
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
  }
  return url.toString();
}

async function providerFetch(url, options, provider) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      redirect:'manual',
      signal:AbortSignal.timeout(15000),
    });
  } catch {
    const error = new Error(`${oauthProvider(provider).label} could not be reached`);
    error.status = 502;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`${oauthProvider(provider).label} rejected the authorization request`);
    error.status = 400;
    throw error;
  }
  return response;
}

export async function exchangeAuthorizationCode(provider, code, redirectUri) {
  const definition = oauthProvider(provider);
  const body = new URLSearchParams({
    client_id:process.env[definition.clientIdEnv],
    client_secret:process.env[definition.clientSecretEnv],
    code,
    redirect_uri:redirectUri,
  });
  if (provider !== 'github') body.set('grant_type', 'authorization_code');

  const response = await providerFetch(definition.tokenUrl, {
    method:'POST',
    headers:{
      Accept:'application/json',
      'Content-Type':'application/x-www-form-urlencoded',
    },
    body,
  }, provider);
  const payload = await response.json().catch(() => ({}));
  if (payload.ok === false || payload.error || !payload.access_token) {
    const error = new Error(`${definition.label} did not return a usable access token`);
    error.status = 400;
    throw error;
  }
  return payload;
}

export async function refreshOauthAccessToken(provider, refreshToken) {
  const definition = oauthProvider(provider);
  const clientId = process.env[definition.clientIdEnv];
  const clientSecret = process.env[definition.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw configurationError(`${definition.label} OAuth is not configured`);
  }
  if (!refreshToken) {
    const error = new Error(`${definition.label} must be reconnected`);
    error.status = 401;
    throw error;
  }
  const response = await providerFetch(definition.tokenUrl, {
    method:'POST',
    headers:{
      Accept:'application/json',
      'Content-Type':'application/x-www-form-urlencoded',
    },
    body:new URLSearchParams({
      client_id:clientId,
      client_secret:clientSecret,
      grant_type:'refresh_token',
      refresh_token:refreshToken,
    }),
  }, provider);
  const payload = await response.json().catch(() => ({}));
  if (payload.ok === false || payload.error || !payload.access_token) {
    const error = new Error(`${definition.label} must be reconnected`);
    error.status = 401;
    throw error;
  }
  return payload;
}

export async function fetchOauthProfile(provider, accessToken) {
  const definition = oauthProvider(provider);
  const response = await providerFetch(definition.profileUrl, {
    method:provider === 'slack' ? 'POST' : 'GET',
    headers:{
      Authorization:`Bearer ${accessToken}`,
      Accept:'application/json',
      ...(provider === 'github' ? {
        'User-Agent':'AgentForge-OAuth',
        'X-GitHub-Api-Version':'2022-11-28',
      } : {}),
    },
  }, provider);
  const payload = await response.json().catch(() => ({}));
  if (payload.ok === false) {
    const error = new Error(`${definition.label} account information is unavailable`);
    error.status = 400;
    throw error;
  }
  if (provider === 'google') {
    return { id:String(payload.sub || ''), name:payload.email || payload.name || 'Google account' };
  }
  if (provider === 'slack') {
    return {
      id:String(payload.team_id || payload.user_id || ''),
      name:payload.team || payload.user || 'Slack workspace',
    };
  }
  return { id:String(payload.id || ''), name:payload.login || payload.name || 'GitHub account' };
}

export function safeOauthRedirect(status, provider, message = '') {
  const frontend = String(process.env.FRONTEND_URL || '').split(',')[0].replace(/\/$/, '');
  const url = new URL('/credentials', frontend || 'http://localhost:5173');
  url.searchParams.set('oauth', status);
  if (provider) url.searchParams.set('provider', provider);
  if (message) url.searchParams.set('message', message.slice(0, 160));
  return url.toString();
}
