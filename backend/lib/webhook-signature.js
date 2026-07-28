import crypto from 'node:crypto';

const MAX_CLOCK_SKEW_SECONDS = 300;

export function signWebhook(secret, timestamp, rawBody) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');
}

export function verifyWebhookSignature({
  secret,
  timestamp,
  signature,
  rawBody,
  now = Date.now(),
}) {
  if (!/^\d{10,13}$/.test(String(timestamp || ''))) return false;
  if (!/^sha256=[a-f0-9]{64}$/.test(String(signature || ''))) return false;
  const timestampMs = String(timestamp).length === 13
    ? Number(timestamp)
    : Number(timestamp) * 1000;
  if (Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_SECONDS * 1000) return false;
  const expected = `sha256=${signWebhook(secret, timestamp, rawBody)}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
