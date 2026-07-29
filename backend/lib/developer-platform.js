import crypto from 'node:crypto';

import { assertSafeConnectorUrl } from './connectors.js';

export const DEVELOPER_SCOPES = [
  'agents:read',
  'agents:run',
  'workflows:read',
  'workflows:run',
  'runs:read',
  'usage:read',
  'webhooks:write',
  'status:read',
];

export const DEVELOPER_WEBHOOK_EVENTS = [
  '*',
  'test.ping',
  'agent.run.completed',
  'agent.run.failed',
  'workflow.run.completed',
  'workflow.run.failed',
];

const SCOPE_SET = new Set(DEVELOPER_SCOPES);
const EVENT_SET = new Set(DEVELOPER_WEBHOOK_EVENTS);

export function hashDeveloperSecret(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function createDeveloperApiKey() {
  const secret = crypto.randomBytes(32).toString('base64url');
  const raw = `afk_live_${secret}`;
  return {
    raw,
    prefix:raw.slice(0, 18),
    hash:hashDeveloperSecret(raw),
  };
}

export function validateDeveloperKeyInput(body) {
  const name = String(body?.name || '').trim();
  const scopes = Array.isArray(body?.scopes)
    ? [...new Set(body.scopes.map(String).map(value => value.trim()).filter(Boolean))]
    : [];
  const rateLimit = Number(body?.rate_limit_per_minute);
  const expiryDays = body?.expiry_days === null || body?.expiry_days === ''
    ? null : Number(body?.expiry_days);
  if (name.length < 2 || name.length > 100) throw validation('Key name must be 2 to 100 characters');
  if (!scopes.length || scopes.some(scope => !SCOPE_SET.has(scope))) {
    throw validation('Choose at least one valid API scope');
  }
  if (!Number.isInteger(rateLimit) || rateLimit < 10 || rateLimit > 600) {
    throw validation('Rate limit must be between 10 and 600 requests per minute');
  }
  if (expiryDays !== null && (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 365)) {
    throw validation('Key expiry must be blank or between 1 and 365 days');
  }
  return { name, scopes, rateLimit, expiryDays };
}

export function validateWebhookInput(body) {
  const name = String(body?.name || '').trim();
  const endpointUrl = String(body?.endpoint_url || '').trim();
  const eventTypes = Array.isArray(body?.event_types)
    ? [...new Set(body.event_types.map(String).map(value => value.trim()).filter(Boolean))]
    : [];
  const maxAttempts = Number(body?.max_attempts ?? 5);
  if (name.length < 2 || name.length > 100) {
    throw validation('Webhook name must be 2 to 100 characters');
  }
  if (!endpointUrl || endpointUrl.length > 2000) throw validation('Webhook endpoint is invalid');
  if (!eventTypes.length || eventTypes.some(event => !EVENT_SET.has(event))) {
    throw validation('Choose at least one supported webhook event');
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw validation('Webhook attempts must be between 1 and 10');
  }
  return { name, endpointUrl, eventTypes, maxAttempts };
}

export async function assertSafeWebhookEndpoint(url) {
  return assertSafeConnectorUrl(url);
}

export function deriveWebhookSecret(subscriptionId, masterKey = webhookMasterKey()) {
  return `afwh_${crypto.createHmac('sha256', masterKey)
    .update(`developer-webhook:${subscriptionId}`)
    .digest('base64url')}`;
}

export function signWebhookPayload(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return { body, timestamp, signature:`t=${timestamp},v1=${signature}` };
}

export async function deliverDeveloperWebhook({
  subscription,
  event,
  fetchImpl = fetch,
  endpointValidator = assertSafeWebhookEndpoint,
}) {
  await endpointValidator(subscription.endpoint_url);
  const envelope = {
    id:event.id,
    type:event.event_type,
    created:event.occurred_at,
    data:event.payload,
  };
  const secret = deriveWebhookSecret(subscription.id);
  const signed = signWebhookPayload(envelope, secret);
  const started = Date.now();
  let response;
  try {
    response = await fetchImpl(subscription.endpoint_url, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'User-Agent':'AgentForge-Webhooks/1.0',
        'X-AgentForge-Event-Id':event.id,
        'X-AgentForge-Event-Type':event.event_type,
        'X-AgentForge-Signature':signed.signature,
      },
      body:signed.body,
      redirect:'manual',
      signal:AbortSignal.timeout(10000),
    });
  } catch (error) {
    const deliveryError = new Error('Webhook endpoint could not be reached');
    deliveryError.code = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? 'WEBHOOK_TIMEOUT' : 'WEBHOOK_NETWORK_ERROR';
    deliveryError.durationMs = Date.now() - started;
    throw deliveryError;
  }
  const responseText = await response.text().catch(() => '');
  const result = {
    delivered:response.status >= 200 && response.status < 300,
    status:response.status,
    responseSha256:hashDeveloperSecret(responseText.slice(0, 100000)),
    durationMs:Date.now() - started,
  };
  if (!result.delivered) {
    const deliveryError = new Error(`Webhook endpoint returned ${response.status}`);
    deliveryError.code = response.status === 429 ? 'WEBHOOK_RATE_LIMITED'
      : response.status >= 500 ? 'WEBHOOK_PROVIDER_ERROR' : 'WEBHOOK_REJECTED';
    Object.assign(deliveryError, result);
    throw deliveryError;
  }
  return result;
}

function webhookMasterKey() {
  const key = process.env.DEVELOPER_WEBHOOK_SIGNING_KEY
    || process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) throw new Error('Developer webhook signing is not configured');
  return key;
}

function validation(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}
