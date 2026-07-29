import crypto from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';

const DOMAIN_PATTERN = /^(?=.{3,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SAFE_ROLES = new Set(['viewer', 'builder']);

export function hashEnterpriseToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function createEnterpriseToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function normalizeOrganizationDomain(value) {
  const domain = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .replace(/\.$/, '');
  if (!DOMAIN_PATTERN.test(domain)) {
    const error = new Error('Enter a valid registrable domain such as example.com');
    error.status = 400;
    throw error;
  }
  return domain;
}

export function validateIdentitySettings(body) {
  const protocol = body?.protocol;
  const providerName = typeof body?.provider_name === 'string'
    ? body.provider_name.trim() : '';
  const issuerUrl = optionalHttpsUrl(body?.issuer_url, 'Issuer URL');
  const metadataUrl = optionalHttpsUrl(body?.metadata_url, 'Metadata URL');
  const clientId = typeof body?.client_id === 'string' ? body.client_id.trim() : '';
  const defaultRole = body?.default_role;
  const sessionMax = Number(body?.session_max_minutes);
  const idleTimeout = Number(body?.idle_timeout_minutes);
  if (!['oidc', 'saml'].includes(protocol)) throw validation('Protocol must be OIDC or SAML');
  if (providerName.length > 120) throw validation('Provider name must be 120 characters or fewer');
  if (clientId.length > 500) throw validation('Client ID must be 500 characters or fewer');
  if (!SAFE_ROLES.has(defaultRole)) throw validation('Default role must be viewer or builder');
  if (!Number.isInteger(sessionMax) || sessionMax < 15 || sessionMax > 43200) {
    throw validation('Maximum session must be between 15 and 43,200 minutes');
  }
  if (!Number.isInteger(idleTimeout) || idleTimeout < 5 || idleTimeout > 1440) {
    throw validation('Idle timeout must be between 5 and 1,440 minutes');
  }
  if (idleTimeout > sessionMax) throw validation('Idle timeout cannot exceed maximum session');
  const ssoEnabled = body?.sso_enabled === true;
  const ssoEnforced = body?.sso_enforced === true;
  if (ssoEnforced && !ssoEnabled) throw validation('Enable SSO before enforcing it');
  if (ssoEnabled && !issuerUrl && !metadataUrl) {
    throw validation('SSO needs an issuer URL or metadata URL');
  }
  return {
    protocol,
    provider_name:providerName || null,
    issuer_url:issuerUrl,
    metadata_url:metadataUrl,
    client_id:clientId || null,
    sso_enabled:ssoEnabled,
    sso_enforced:ssoEnforced,
    jit_provisioning:body?.jit_provisioning === true,
    default_role:defaultRole,
    require_mfa:body?.require_mfa === true,
    session_max_minutes:sessionMax,
    idle_timeout_minutes:idleTimeout,
    scim_enabled:body?.scim_enabled === true,
  };
}

export async function verifyOrganizationDomainDns(domain, token, resolver = resolveTxt) {
  const expected = `agentforge-verification=${token}`;
  let records;
  try {
    records = await resolver(`_agentforge-verify.${domain}`);
  } catch (error) {
    const dnsError = new Error('Verification TXT record was not found');
    dnsError.status = 409;
    dnsError.code = 'DOMAIN_DNS_NOT_READY';
    dnsError.cause = error;
    throw dnsError;
  }
  const values = records.map(parts => parts.join(''));
  if (!values.includes(expected)) {
    const mismatch = new Error('Verification TXT record does not match this domain challenge');
    mismatch.status = 409;
    mismatch.code = 'DOMAIN_DNS_MISMATCH';
    throw mismatch;
  }
  return true;
}

export function scimBearerToken(req) {
  const header = String(req.get('authorization') || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function optionalHttpsUrl(value, label) {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input) return null;
  let url;
  try {
    url = new URL(input);
  } catch {
    throw validation(`${label} must be a valid HTTPS URL`);
  }
  if (url.protocol !== 'https:') throw validation(`${label} must use HTTPS`);
  return url.toString();
}

function validation(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}
