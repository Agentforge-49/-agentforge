import crypto from 'node:crypto';

import { decryptSecret } from './credential-vault.js';
import { parsePublicResponse, requestPublicUrl, resolvePublicUrl } from './safe-http.js';
import { supabase } from './supabase.js';

export const CONNECTOR_DEFINITIONS = [
  { action:'http.request', name:'HTTP Request', credential_optional:true },
  { action:'email.send', name:'Send Email', providers:['resend'] },
  { action:'slack.message', name:'Slack Message', providers:['slack'] },
  { action:'google_sheets.append', name:'Google Sheets: Append Row', providers:['google'] },
  { action:'google_drive.create_file', name:'Google Drive: Create File', providers:['google'] },
  { action:'database.select', name:'Database: Select Rows', providers:['supabase'] },
  { action:'database.insert', name:'Database: Insert Row', providers:['supabase'] },
];

const DEFINITION_MAP = new Map(CONNECTOR_DEFINITIONS.map(item => [item.action, item]));
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateConnectorConfig(config = {}) {
  const errors = [];
  const action = text(config.action);
  const definition = DEFINITION_MAP.get(action);
  if (!definition) errors.push('Connector action is unsupported');
  const credentialId = text(config.credential_id);
  if (definition && !definition.credential_optional && !credentialId) {
    errors.push(`${definition.name} requires a credential`);
  }
  if (credentialId && !/^[0-9a-f-]{36}$/i.test(credentialId)) {
    errors.push('Connector credential is invalid');
  }
  const parameters = config.parameters;
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    errors.push('Connector parameters must be an object');
  } else if (JSON.stringify(parameters).length > 20000) {
    errors.push('Connector parameters are too large');
  }
  return {
    errors,
    value: errors.length ? undefined : {
      action,
      credential_id: credentialId || null,
      parameters,
    },
  };
}

function templateValue(value, input) {
  const replacement = typeof input === 'string' ? input : JSON.stringify(input);
  if (typeof value === 'string') return value.split('{{input}}').join(replacement);
  if (Array.isArray(value)) return value.map(item => templateValue(item, input));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, templateValue(item, input)]),
    );
  }
  return value;
}

export function renderConnectorParameters(parameters, input) {
  return templateValue(parameters, input);
}

export async function assertSafeConnectorUrl(value, { allowedHostSuffix = null } = {}) {
  return (await resolvePublicUrl(value, { allowedHostSuffix })).url;
}

async function loadCredential(credentialId, userId, definition) {
  if (!credentialId) return null;
  const { data: credential, error } = await supabase
    .from('vault_credentials')
    .select('*')
    .eq('id', credentialId)
    .eq('user_id', userId)
    .single();
  if (error || !credential) throw new Error('Connector credential is unavailable');
  if (definition.providers && !definition.providers.includes(credential.provider)) {
    throw new Error(`${definition.name} cannot use a ${credential.provider} credential`);
  }
  const { data: version, error: versionError } = await supabase
    .from('vault_credential_versions')
    .select('*')
    .eq('credential_id', credential.id)
    .eq('user_id', userId)
    .eq('version', credential.current_version)
    .single();
  if (versionError || !version) throw new Error('Connector credential version is unavailable');
  const secret = decryptSecret(
    version,
    `credential:${userId}:${credential.id}:${credential.current_version}`,
  );
  return { credential, secret };
}

function redact(value, secret) {
  if (!secret) return value;
  if (typeof value === 'string') return value.split(secret).join('[REDACTED]');
  if (Array.isArray(value)) return value.map(item => redact(item, secret));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redact(item, secret)]),
    );
  }
  return value;
}

async function executeHttp(parameters, credential) {
  const url = text(parameters.url);
  const method = text(parameters.method || 'GET').toUpperCase();
  if (!HTTP_METHODS.has(method)) throw new Error('HTTP method is unsupported');
  const configuredHeaders = parameters.headers && typeof parameters.headers === 'object'
    ? parameters.headers : {};
  const headers = {};
  for (const [key, value] of Object.entries(configuredHeaders)) {
    if (/^(authorization|cookie|host|content-length)$/i.test(key)) continue;
    if (typeof value === 'string' && value.length <= 2000) headers[key] = value;
  }
  if (credential) headers.Authorization = `Bearer ${credential.secret}`;
  let body;
  if (method !== 'GET' && parameters.body !== undefined) {
    body = typeof parameters.body === 'string'
      ? parameters.body
      : JSON.stringify(parameters.body);
    if (body.length > 50000) throw new Error('HTTP request body exceeded 50 KB');
    if (typeof parameters.body !== 'string') headers['Content-Type'] = 'application/json';
  }
  const response = await requestPublicUrl(url, {
    method,
    headers,
    body,
  });
  return { status:response.status, body:parsePublicResponse(response) };
}

async function executeEmail(parameters, credential) {
  const to = text(parameters.to);
  const from = text(parameters.from);
  const subject = text(parameters.subject);
  const emailText = text(parameters.text);
  if (!to || !from || !subject || !emailText) {
    throw new Error('Email requires to, from, subject, and text');
  }
  const response = await requestPublicUrl('https://api.resend.com/emails', {
    method:'POST',
    headers:{ Authorization:`Bearer ${credential.secret}`, 'Content-Type':'application/json' },
    body:JSON.stringify({ to:[to], from, subject, text:emailText }),
  });
  return parsePublicResponse(response);
}

async function executeSlack(parameters, credential) {
  const channel = text(parameters.channel);
  const message = text(parameters.text);
  if (!channel || !message) throw new Error('Slack requires channel and text');
  const response = await requestPublicUrl('https://slack.com/api/chat.postMessage', {
    method:'POST',
    headers:{ Authorization:`Bearer ${credential.secret}`, 'Content-Type':'application/json' },
    body:JSON.stringify({ channel, text:message }),
  });
  const body = parsePublicResponse(response);
  if (!body.ok) throw new Error('Slack rejected the connector request');
  return { ok:true, channel:body.channel, timestamp:body.ts };
}

async function executeSheets(parameters, credential) {
  const spreadsheetId = text(parameters.spreadsheet_id);
  const range = text(parameters.range);
  const values = Array.isArray(parameters.values) ? parameters.values : [parameters.values];
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(spreadsheetId) || !range || values.length > 100) {
    throw new Error('Google Sheets requires a spreadsheet, range, and up to 100 values');
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const response = await requestPublicUrl(url, {
    method:'POST',
    headers:{ Authorization:`Bearer ${credential.secret}`, 'Content-Type':'application/json' },
    body:JSON.stringify({ values:[values] }),
  });
  const body = parsePublicResponse(response);
  return { updated_range:body.updates?.updatedRange, updated_cells:body.updates?.updatedCells };
}

async function executeDrive(parameters, credential) {
  const name = text(parameters.name);
  const content = String(parameters.content ?? '');
  if (!name || name.length > 255 || content.length > 50000) {
    throw new Error('Google Drive file name or content is invalid');
  }
  const boundary = `agentforge_${crypto.randomUUID()}`;
  const multipart = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name })}\r\n`,
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${content}\r\n`,
    `--${boundary}--`,
  ].join('');
  const response = await requestPublicUrl('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method:'POST',
    headers:{ Authorization:`Bearer ${credential.secret}`, 'Content-Type':`multipart/related; boundary=${boundary}` },
    body:multipart,
  });
  return parsePublicResponse(response);
}

async function executeDatabase(action, parameters, credential) {
  const projectUrl = text(credential.credential.metadata?.project_url);
  const table = text(parameters.table);
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(table)) {
    throw new Error('Database table name is invalid');
  }
  const base = new URL(projectUrl);
  const url = new URL(`/rest/v1/${table}`, base);
  const headers = {
    apikey:credential.secret,
    Authorization:`Bearer ${credential.secret}`,
    'Content-Type':'application/json',
  };
  let method = 'GET';
  let body;
  if (action === 'database.select') {
    url.searchParams.set('select', text(parameters.select) || '*');
    url.searchParams.set('limit', String(Math.min(100, Math.max(1, Number(parameters.limit) || 25))));
    const filters = parameters.filters && typeof parameters.filters === 'object'
      ? parameters.filters : {};
    for (const [column, value] of Object.entries(filters)) {
      if (/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(column)) {
        url.searchParams.set(column, `eq.${String(value).slice(0, 500)}`);
      }
    }
  } else {
    method = 'POST';
    headers.Prefer = 'return=representation';
    body = JSON.stringify(parameters.row ?? {});
    if (body.length > 50000) throw new Error('Database row exceeded 50 KB');
  }
  const response = await requestPublicUrl(url, {
    method,
    headers,
    body,
    allowedHostSuffix:'.supabase.co',
  });
  return parsePublicResponse(response);
}

export async function executeConnector(config, input, userId) {
  const validated = validateConnectorConfig(config);
  if (validated.errors.length) throw new Error(validated.errors.join('; '));
  const { action, credential_id: credentialId } = validated.value;
  const definition = DEFINITION_MAP.get(action);
  const parameters = renderConnectorParameters(validated.value.parameters, input);
  const credential = await loadCredential(credentialId, userId, definition);
  let output;
  if (action === 'http.request') output = await executeHttp(parameters, credential);
  else if (action === 'email.send') output = await executeEmail(parameters, credential);
  else if (action === 'slack.message') output = await executeSlack(parameters, credential);
  else if (action === 'google_sheets.append') output = await executeSheets(parameters, credential);
  else if (action === 'google_drive.create_file') output = await executeDrive(parameters, credential);
  else if (action.startsWith('database.')) output = await executeDatabase(action, parameters, credential);
  else throw new Error('Connector action is unsupported');
  return redact(output, credential?.secret);
}
