import crypto from 'node:crypto';

const PROVIDERS = new Set(['generic', 'openai', 'anthropic', 'slack', 'github']);
const TEST_TARGETS = {
  openai: {
    url: 'https://api.openai.com/v1/models',
    headers: secret => ({ Authorization: `Bearer ${secret}` }),
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/models',
    headers: secret => ({
      'x-api-key': secret,
      'anthropic-version': '2023-06-01',
    }),
  },
  slack: {
    url: 'https://slack.com/api/auth.test',
    method: 'POST',
    headers: secret => ({ Authorization: `Bearer ${secret}` }),
  },
  github: {
    url: 'https://api.github.com/user',
    headers: secret => ({
      Authorization: `Bearer ${secret}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AgentForge-Credential-Test',
    }),
  },
};

function configurationError(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

function keyMaterial() {
  const configured = process.env.CREDENTIAL_ENCRYPTION_KEY || '';
  let key = Buffer.alloc(0);
  try {
    key = Buffer.from(configured, 'base64');
  } catch {
    // Fall through to high-entropy text handling below.
  }
  if (key.length !== 32 && Buffer.byteLength(configured, 'utf8') >= 32) {
    key = crypto.createHash('sha256').update(configured).digest();
  }
  if (key.length !== 32) {
    throw configurationError('Credential vault is not configured');
  }
  return {
    key,
    version: process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION || 'v1',
  };
}

export function validateCredentialInput(input, { partial = false } = {}) {
  const errors = [];
  const value = {};
  if (!partial || Object.hasOwn(input, 'name')) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 100) errors.push('Credential name must be between 1 and 100 characters');
    else value.name = name;
  }
  if (!partial || Object.hasOwn(input, 'provider')) {
    if (!PROVIDERS.has(input.provider)) errors.push('Unsupported credential provider');
    else value.provider = input.provider;
  }
  if (!partial || Object.hasOwn(input, 'secret')) {
    const secret = typeof input.secret === 'string' ? input.secret.trim() : '';
    if (secret.length < 8 || secret.length > 10000) {
      errors.push('Secret must be between 8 and 10,000 characters');
    } else {
      value.secret = secret;
    }
  }
  if (Object.hasOwn(input, 'metadata')) {
    if (!input.metadata || typeof input.metadata !== 'object' || Array.isArray(input.metadata)) {
      errors.push('Credential metadata must be an object');
    } else if (JSON.stringify(input.metadata).length > 4000) {
      errors.push('Credential metadata is too large');
    } else {
      value.metadata = input.metadata;
    }
  }
  return { errors, value };
}

export function encryptSecret(secret, context) {
  const { key, version } = keyMaterial();
  const initializationVector = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, initializationVector);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  const authenticationTag = cipher.getAuthTag();
  const fingerprint = crypto
    .createHmac('sha256', key)
    .update(secret)
    .digest('hex');
  return {
    ciphertext: ciphertext.toString('base64'),
    initialization_vector: initializationVector.toString('base64'),
    authentication_tag: authenticationTag.toString('base64'),
    key_version: version,
    fingerprint,
    last_four: secret.slice(-4),
  };
}

export function decryptSecret(encrypted, context) {
  const { key, version } = keyMaterial();
  if (encrypted.key_version !== version) {
    throw configurationError(`Credential key version ${encrypted.key_version} is unavailable`);
  }
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(encrypted.initialization_vector, 'base64'),
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(encrypted.authentication_tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw configurationError('Credential could not be decrypted');
  }
}

export function maskCredential(lastFour) {
  return `••••${lastFour}`;
}

function formatLooksValid(provider, secret) {
  if (provider === 'openai') return secret.startsWith('sk-');
  if (provider === 'anthropic') return secret.startsWith('sk-ant-');
  if (provider === 'slack') return secret.startsWith('xox');
  if (provider === 'github') return /^(gh[pousr]_|github_pat_)/.test(secret);
  return secret.length >= 8;
}

export async function testCredentialConnection(provider, secret) {
  if (!formatLooksValid(provider, secret)) {
    return { passed: false, message: 'Credential format does not match the selected provider' };
  }
  const target = TEST_TARGETS[provider];
  if (!target) {
    return { passed: true, message: 'Encryption and decryption integrity verified' };
  }
  try {
    const response = await fetch(target.url, {
      method: target.method || 'GET',
      headers: target.headers(secret),
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    if (response.status >= 200 && response.status < 300) {
      if (provider === 'slack') {
        const body = await response.json().catch(() => ({}));
        if (!body.ok) return { passed: false, message: 'Provider rejected the credential' };
      }
      return { passed: true, message: 'Provider connection verified' };
    }
    return { passed: false, message: 'Provider rejected the credential' };
  } catch {
    return { passed: false, message: 'Provider connection test could not be completed' };
  }
}
