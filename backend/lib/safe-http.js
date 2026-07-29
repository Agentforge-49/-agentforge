import dns from 'node:dns/promises';
import net from 'node:net';

import { Agent, fetch as undiciFetch } from 'undici';

const BLOCKED_V4 = new net.BlockList();
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) => BLOCKED_V4.addSubnet(address, prefix, 'ipv4'));

const BLOCKED_V6 = new net.BlockList();
[
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['2001:db8::', 32],
  ['ff00::', 8],
].forEach(([address, prefix]) => BLOCKED_V6.addSubnet(address, prefix, 'ipv6'));

const BLOCKED_HOST_SUFFIXES = ['.internal', '.local', '.localhost'];

function isBlockedAddress(address) {
  if (net.isIPv4(address)) return BLOCKED_V4.check(address, 'ipv4');
  if (net.isIPv6(address)) return BLOCKED_V6.check(address, 'ipv6');
  return true;
}

export async function resolvePublicUrl(value, { allowedHostSuffix = null } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Connector URL is invalid');
  }
  const hostname = url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Connector URLs must use HTTPS without embedded credentials');
  }
  if (
    !hostname
    || hostname === 'localhost'
    || BLOCKED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))
  ) {
    throw new Error('Connector URL resolves to a blocked network');
  }
  if (allowedHostSuffix && !hostname.endsWith(allowedHostSuffix)) {
    throw new Error(`Connector URL must use a ${allowedHostSuffix} host`);
  }

  let addresses;
  if (net.isIP(hostname)) {
    addresses = [{ address:hostname, family:net.isIPv4(hostname) ? 4 : 6 }];
  } else {
    try {
      addresses = await dns.lookup(hostname, { all:true, verbatim:true });
    } catch {
      throw new Error('Connector URL hostname could not be resolved');
    }
  }
  if (!addresses.length || addresses.some(item => isBlockedAddress(item.address))) {
    throw new Error('Connector URL resolves to a blocked network');
  }
  return { url, address:addresses[0] };
}

async function readBoundedBody(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`Connector response exceeded ${Math.ceil(maxBytes / 1000)} KB`);
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body || []) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      throw new Error(`Connector response exceeded ${Math.ceil(maxBytes / 1000)} KB`);
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

export async function requestPublicUrl(
  value,
  {
    allowedHostSuffix = null,
    maxResponseBytes = 100_000,
    timeoutMs = 15_000,
    ...options
  } = {},
) {
  const { url, address } = await resolvePublicUrl(value, { allowedHostSuffix });
  const dispatcher = new Agent({
    connect:{
      lookup(_hostname, lookupOptions, callback) {
        if (lookupOptions?.all) {
          callback(null, [{ address:address.address, family:address.family }]);
          return;
        }
        callback(null, address.address, address.family);
      },
    },
  });
  try {
    const response = await undiciFetch(url, {
      ...options,
      dispatcher,
      redirect:'manual',
      signal:AbortSignal.timeout(timeoutMs),
    });
    return {
      ok:response.ok,
      status:response.status,
      headers:response.headers,
      bodyText:await readBoundedBody(response, maxResponseBytes),
    };
  } finally {
    await dispatcher.close();
  }
}

export function parsePublicResponse(response) {
  if (!response.ok) throw new Error(`Connector provider returned ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!response.bodyText) return contentType.includes('application/json') ? {} : '';
  if (!contentType.includes('application/json')) return response.bodyText;
  try {
    return JSON.parse(response.bodyText);
  } catch {
    throw new Error('Connector provider returned invalid JSON');
  }
}
