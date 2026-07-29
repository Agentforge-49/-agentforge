import crypto from 'node:crypto';

export const BILLING_PROVIDERS = new Set(['stripe', 'paddle', 'agentforge']);
export const BILLING_PLANS = new Set(['pro', 'enterprise']);

export function hashBillingValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function createCheckoutToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function validateCheckoutInput(body) {
  const planKey = body?.plan_key;
  const interval = body?.billing_interval;
  if (!BILLING_PLANS.has(planKey)) {
    const error = new Error('Choose the Pro or Enterprise plan');
    error.status = 400;
    throw error;
  }
  if (!['monthly', 'annual'].includes(interval)) {
    const error = new Error('Billing interval must be monthly or annual');
    error.status = 400;
    throw error;
  }
  return { planKey, interval };
}

export function verifyWebhookSignature({ rawBody, signature, secret }) {
  if (!secret || !signature || !rawBody) return false;
  const received = String(signature).replace(/^sha256=/, '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}

export function billingMode() {
  return String(process.env.BILLING_MODE || 'test').toLowerCase() === 'live' ? 'live' : 'test';
}
