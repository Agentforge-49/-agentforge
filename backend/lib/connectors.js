import crypto from 'node:crypto';

import { decryptSecret, encryptSecret } from './credential-vault.js';
import { refreshOauthAccessToken } from './oauth.js';
import { parsePublicResponse, requestPublicUrl, resolvePublicUrl } from './safe-http.js';
import { supabase } from './supabase.js';

export const CONNECTOR_DEFINITIONS = [
  { action:'http.request', name:'HTTP Request', category:'Universal', credential_optional:true },
  { action:'email.send', name:'Resend: Send Email', category:'Communication', providers:['resend'] },
  { action:'slack.message', name:'Slack: Send Message', category:'Communication', providers:['slack'] },
  { action:'google_sheets.append', name:'Google Sheets: Append Row', category:'Productivity', providers:['google'] },
  { action:'google_drive.create_file', name:'Google Drive: Create File', category:'Productivity', providers:['google'] },
  { action:'database.select', name:'Supabase: Select Rows', category:'Data', providers:['supabase'] },
  { action:'database.insert', name:'Supabase: Insert Row', category:'Data', providers:['supabase'] },
  { action:'github.issue.create', name:'GitHub: Create Issue', category:'Engineering', providers:['github', 'generic'], app_slugs:['github'] },
  { action:'discord.message', name:'Discord: Send Message', category:'Communication', providers:['generic'], app_slugs:['discord', 'discord_bot'] },
  { action:'notion.page.create', name:'Notion: Create Page', category:'Productivity', providers:['generic'], app_slugs:['notion'] },
  { action:'airtable.record.create', name:'Airtable: Create Record', category:'Data', providers:['generic'], app_slugs:['airtable', 'airtable_oauth'] },
  { action:'hubspot.contact.create', name:'HubSpot: Create Contact', category:'CRM', providers:['generic'], app_slugs:['hubspot'] },
  { action:'salesforce.record.create', name:'Salesforce: Create Record', category:'CRM', providers:['generic'], app_slugs:['salesforce'] },
  { action:'stripe.customer.create', name:'Stripe: Create Customer', category:'Commerce', providers:['generic'], app_slugs:['stripe'] },
  { action:'shopify.product.create', name:'Shopify: Create Product', category:'Commerce', providers:['generic'], app_slugs:['shopify'] },
  { action:'jira.issue.create', name:'Jira: Create Issue', category:'Engineering', providers:['generic'], app_slugs:['jira'] },
  { action:'linear.issue.create', name:'Linear: Create Issue', category:'Engineering', providers:['generic'], app_slugs:['linear'] },
  { action:'twilio.message.send', name:'Twilio: Send SMS', category:'Communication', providers:['generic'], app_slugs:['twilio'] },
  { action:'zendesk.ticket.create', name:'Zendesk: Create Ticket', category:'Support', providers:['generic'], app_slugs:['zendesk'] },
  { action:'gmail.message.send', name:'Gmail: Send Message', category:'Communication', providers:['google', 'generic'], app_slugs:['gmail'] },
  { action:'outlook.message.send', name:'Outlook: Send Message', category:'Communication', providers:['generic'], app_slugs:['microsoft_outlook'] },
  { action:'teams.message.send', name:'Teams: Send Channel Message', category:'Communication', providers:['generic'], app_slugs:['microsoft_teams'] },
  { action:'google_calendar.event.create', name:'Google Calendar: Create Event', category:'Productivity', providers:['google', 'generic'], app_slugs:['google_calendar'] },
  { action:'zoom.meeting.create', name:'Zoom: Create Meeting', category:'Communication', providers:['generic'], app_slugs:['zoom'] },
  { action:'calendly.events.list', name:'Calendly: List Scheduled Events', category:'Productivity', providers:['generic'], app_slugs:['calendly'] },
  { action:'asana.task.create', name:'Asana: Create Task', category:'Productivity', providers:['generic'], app_slugs:['asana'] },
  { action:'trello.card.create', name:'Trello: Create Card', category:'Productivity', providers:['generic'], app_slugs:['trello'] },
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

export async function loadConnectorCredential(credentialId, userId, definition) {
  if (!credentialId) return null;
  const { data: credential, error } = await supabase
    .from('vault_credentials')
    .select('*')
    .eq('id', credentialId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!credential) return loadOauthCredential(credentialId, userId, definition);
  if (definition.providers && !definition.providers.includes(credential.provider)) {
    throw new Error(`${definition.name} cannot use a ${credential.provider} credential`);
  }
  if (credential.provider === 'generic' && definition.app_slugs?.length) {
    const appSlug = text(credential.metadata?.app_slug).toLowerCase();
    if (!definition.app_slugs.includes(appSlug)) {
      throw new Error(`${definition.name} requires a matching ${definition.app_slugs[0]} credential`);
    }
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
  return { credential, secret, source:'vault' };
}

function oauthContext(userId, connectionId, tokenType) {
  return `oauth:${userId}:${connectionId}:${tokenType}`;
}

function oauthTokenIsExpiring(connection) {
  if (!connection.access_token_expires_at) return false;
  const expiresAt = Date.parse(connection.access_token_expires_at);
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60_000;
}

async function loadOauthCredential(credentialId, userId, definition) {
  const { data:connection, error } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('id', credentialId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!connection || connection.status !== 'active') {
    throw new Error('Connector credential is unavailable');
  }
  if (definition.providers && !definition.providers.includes(connection.provider)) {
    throw new Error(`${definition.name} cannot use a ${connection.provider} connection`);
  }

  let secret = decryptSecret(
    connection.encrypted_access_token,
    oauthContext(userId, connection.id, 'access'),
  );
  if (oauthTokenIsExpiring(connection)) {
    if (!connection.encrypted_refresh_token) {
      await supabase.from('oauth_connections')
        .update({ status:'expired' })
        .eq('id', connection.id)
        .eq('user_id', userId);
      throw new Error(`${connection.provider} connection has expired; reconnect it`);
    }
    const refreshToken = decryptSecret(
      connection.encrypted_refresh_token,
      oauthContext(userId, connection.id, 'refresh'),
    );
    let refreshed;
    try {
      refreshed = await refreshOauthAccessToken(connection.provider, refreshToken);
    } catch (error) {
      await supabase.from('oauth_connections')
        .update({ status:'expired' })
        .eq('id', connection.id)
        .eq('user_id', userId);
      throw error;
    }
    secret = refreshed.access_token;
    const expiresIn = Number(refreshed.expires_in);
    const updates = {
      encrypted_access_token:encryptSecret(
        secret,
        oauthContext(userId, connection.id, 'access'),
      ),
      access_token_expires_at:Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null,
      status:'active',
    };
    if (refreshed.refresh_token) {
      updates.encrypted_refresh_token = encryptSecret(
        refreshed.refresh_token,
        oauthContext(userId, connection.id, 'refresh'),
      );
    }
    await supabase.from('oauth_connections')
      .update(updates)
      .eq('id', connection.id)
      .eq('user_id', userId);
  }
  return {
    credential:{
      ...connection,
      name:connection.provider_account_name || `${connection.provider} account`,
    },
    secret,
    source:'oauth',
  };
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

export function credentialAuthHeaders(loadedCredential) {
  if (!loadedCredential?.secret) return {}
  const metadata = loadedCredential.credential?.metadata || {}
  const mode = text(metadata.auth_mode || 'bearer').toLowerCase()
  if (mode === 'basic') {
    return { Authorization:`Basic ${Buffer.from(loadedCredential.secret, 'utf8').toString('base64')}` }
  }
  if (mode === 'header') {
    const name = text(metadata.header_name)
    if (!/^[A-Za-z][A-Za-z0-9-]{0,79}$/.test(name) || /^(authorization|cookie|host|content-length)$/i.test(name)) {
      throw new Error('Custom API key header name is invalid')
    }
    return { [name]:loadedCredential.secret }
  }
  return { Authorization:`Bearer ${loadedCredential.secret}` }
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
  Object.assign(headers, credentialAuthHeaders(credential));
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

function required(value, label, maxLength = 500) {
  const normalized = text(value);
  if (!normalized || normalized.length > maxLength) throw new Error(`${label} is required`);
  return normalized;
}

function identifier(value, label, pattern = /^[A-Za-z0-9_-]{1,200}$/) {
  const normalized = required(value, label, 200);
  if (!pattern.test(normalized)) throw new Error(`${label} is invalid`);
  return normalized;
}

function objectValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function jsonOptions(secret, body, extraHeaders = {}) {
  const headers = { 'Content-Type':'application/json', ...extraHeaders };
  if (secret) headers.Authorization = `Bearer ${secret}`;
  return {
    method:'POST',
    headers,
    body:JSON.stringify(body),
  };
}

export function buildAppConnectorRequest(action, parameters = {}, secret = '') {
  if (!secret) throw new Error('Connector credential is unavailable');

  if (action === 'github.issue.create') {
    const owner = identifier(parameters.owner, 'GitHub owner');
    const repository = identifier(parameters.repository, 'GitHub repository', /^[A-Za-z0-9_.-]{1,100}$/);
    const title = required(parameters.title, 'Issue title', 256);
    const labels = Array.isArray(parameters.labels) ? parameters.labels.map(item => text(item)).filter(Boolean).slice(0, 20) : [];
    return {
      url:`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues`,
      options:jsonOptions(secret, { title, body:text(parameters.body).slice(0, 20_000), labels }, {
        Accept:'application/vnd.github+json',
        'User-Agent':'AgentForge-Connector',
        'X-GitHub-Api-Version':'2022-11-28',
      }),
    };
  }
  if (action === 'discord.message') {
    const channelId = identifier(parameters.channel_id, 'Discord channel ID', /^\d{5,30}$/);
    return {
      url:`https://discord.com/api/v10/channels/${channelId}/messages`,
      options:jsonOptions('', { content:required(parameters.content, 'Discord message', 2_000) }, { Authorization:`Bot ${secret}` }),
    };
  }
  if (action === 'notion.page.create') {
    const pageId = identifier(parameters.parent_page_id, 'Notion parent page ID', /^[A-Fa-f0-9-]{32,36}$/);
    const title = required(parameters.title, 'Notion page title', 2_000);
    const content = text(parameters.content).slice(0, 2_000);
    return {
      url:'https://api.notion.com/v1/pages',
      options:jsonOptions(secret, {
        parent:{ page_id:pageId },
        properties:{ title:{ title:[{ text:{ content:title } }] } },
        children:content ? [{ object:'block', type:'paragraph', paragraph:{ rich_text:[{ type:'text', text:{ content } }] } }] : [],
      }, { 'Notion-Version':'2026-03-11' }),
    };
  }
  if (action === 'airtable.record.create') {
    const baseId = identifier(parameters.base_id, 'Airtable base ID');
    const tableId = identifier(parameters.table_id, 'Airtable table ID', /^[A-Za-z0-9 _-]{1,200}$/);
    return {
      url:`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`,
      options:jsonOptions(secret, { records:[{ fields:objectValue(parameters.fields, 'Airtable fields') }] }),
    };
  }
  if (action === 'hubspot.contact.create') {
    return {
      url:'https://api.hubapi.com/crm/v3/objects/contacts',
      options:jsonOptions(secret, { properties:objectValue(parameters.properties, 'HubSpot contact properties') }),
    };
  }
  if (action === 'salesforce.record.create') {
    const instance = required(parameters.instance, 'Salesforce instance', 100).toLowerCase();
    if (!/^[a-z0-9-]+$/.test(instance)) throw new Error('Salesforce instance is invalid');
    const objectName = identifier(parameters.object, 'Salesforce object', /^[A-Za-z][A-Za-z0-9_]{0,79}$/);
    return {
      url:`https://${instance}.my.salesforce.com/services/data/v67.0/sobjects/${objectName}`,
      options:jsonOptions(secret, objectValue(parameters.fields, 'Salesforce fields')),
      allowedHostSuffix:'.my.salesforce.com',
    };
  }
  if (action === 'stripe.customer.create') {
    const form = new URLSearchParams();
    if (text(parameters.email)) form.set('email', text(parameters.email).slice(0, 320));
    if (text(parameters.name)) form.set('name', text(parameters.name).slice(0, 256));
    if (text(parameters.description)) form.set('description', text(parameters.description).slice(0, 1_000));
    if (![...form.keys()].length) throw new Error('Stripe customer requires a name, email, or description');
    return {
      url:'https://api.stripe.com/v1/customers',
      options:{ method:'POST', headers:{ Authorization:`Bearer ${secret}`, 'Content-Type':'application/x-www-form-urlencoded' }, body:form.toString() },
    };
  }
  if (action === 'shopify.product.create') {
    const store = required(parameters.store, 'Shopify store', 80).toLowerCase().replace(/\.myshopify\.com$/, '');
    if (!/^[a-z0-9][a-z0-9-]{1,78}$/.test(store)) throw new Error('Shopify store is invalid');
    const product = {
      title:required(parameters.title, 'Shopify product title', 255),
      body_html:text(parameters.description).slice(0, 20_000),
      vendor:text(parameters.vendor).slice(0, 255),
      product_type:text(parameters.product_type).slice(0, 255),
      tags:text(parameters.tags).slice(0, 1_000),
    };
    return {
      url:`https://${store}.myshopify.com/admin/api/2026-07/products.json`,
      options:jsonOptions('', { product }, { 'X-Shopify-Access-Token':secret }),
      allowedHostSuffix:'.myshopify.com',
    };
  }
  if (action === 'jira.issue.create') {
    const site = required(parameters.site, 'Jira site', 100).toLowerCase().replace(/\.atlassian\.net$/, '');
    if (!/^[a-z0-9][a-z0-9-]{1,98}$/.test(site)) throw new Error('Jira site is invalid');
    const email = required(parameters.email, 'Jira account email', 320);
    const projectKey = identifier(parameters.project_key, 'Jira project key', /^[A-Z][A-Z0-9_]{1,19}$/);
    const summary = required(parameters.summary, 'Jira issue summary', 255);
    const description = text(parameters.description).slice(0, 20_000);
    return {
      url:`https://${site}.atlassian.net/rest/api/3/issue`,
      options:jsonOptions('', { fields:{ project:{ key:projectKey }, summary, issuetype:{ name:text(parameters.issue_type) || 'Task' }, description:{ type:'doc', version:1, content:description ? [{ type:'paragraph', content:[{ type:'text', text:description }] }] : [] } } }, {
        Authorization:`Basic ${Buffer.from(`${email}:${secret}`).toString('base64')}`,
      }),
      allowedHostSuffix:'.atlassian.net',
    };
  }
  if (action === 'linear.issue.create') {
    const teamId = identifier(parameters.team_id, 'Linear team ID', /^[A-Fa-f0-9-]{20,40}$/);
    const title = required(parameters.title, 'Linear issue title', 255);
    return {
      url:'https://api.linear.app/graphql',
      options:jsonOptions('', {
        query:'mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }',
        variables:{ input:{ teamId, title, description:text(parameters.description).slice(0, 20_000) } },
      }, { Authorization:secret }),
    };
  }
  if (action === 'twilio.message.send') {
    const accountSid = identifier(parameters.account_sid, 'Twilio account SID', /^AC[a-fA-F0-9]{32}$/);
    const form = new URLSearchParams({
      To:required(parameters.to, 'Twilio recipient', 30),
      From:required(parameters.from, 'Twilio sender', 30),
      Body:required(parameters.body, 'Twilio message', 1_600),
    });
    return {
      url:`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      options:{ method:'POST', headers:{ Authorization:`Basic ${Buffer.from(`${accountSid}:${secret}`).toString('base64')}`, 'Content-Type':'application/x-www-form-urlencoded' }, body:form.toString() },
    };
  }
  if (action === 'zendesk.ticket.create') {
    const subdomain = required(parameters.subdomain, 'Zendesk subdomain', 80).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,78}$/.test(subdomain)) throw new Error('Zendesk subdomain is invalid');
    const email = required(parameters.email, 'Zendesk account email', 320);
    return {
      url:`https://${subdomain}.zendesk.com/api/v2/tickets.json`,
      options:jsonOptions('', { ticket:{ subject:required(parameters.subject, 'Zendesk ticket subject', 255), comment:{ body:required(parameters.comment, 'Zendesk ticket comment', 20_000) } } }, {
        Authorization:`Basic ${Buffer.from(`${email}/token:${secret}`).toString('base64')}`,
      }),
      allowedHostSuffix:'.zendesk.com',
    };
  }
  if (action === 'gmail.message.send') {
    const to = required(parameters.to, 'Gmail recipient', 320);
    const subject = required(parameters.subject, 'Gmail subject', 998);
    const body = required(parameters.body, 'Gmail message', 20_000);
    const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`, 'utf8')
      .toString('base64url');
    return { url:'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', options:jsonOptions(secret, { raw }) };
  }
  if (action === 'outlook.message.send') {
    const to = required(parameters.to, 'Outlook recipient', 320);
    return { url:'https://graph.microsoft.com/v1.0/me/sendMail', options:jsonOptions(secret, {
      message:{ subject:required(parameters.subject, 'Outlook subject', 998), body:{ contentType:'Text', content:required(parameters.body, 'Outlook message', 20_000) }, toRecipients:[{ emailAddress:{ address:to } }] },
      saveToSentItems:true,
    }) };
  }
  if (action === 'teams.message.send') {
    const teamId = identifier(parameters.team_id, 'Teams team ID', /^[A-Za-z0-9-]{20,80}$/);
    const channelId = identifier(parameters.channel_id, 'Teams channel ID', /^[A-Za-z0-9:._-]{5,160}$/);
    return { url:`https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`, options:jsonOptions(secret, { body:{ contentType:'text', content:required(parameters.body, 'Teams message', 20_000) } }) };
  }
  if (action === 'google_calendar.event.create') {
    const calendarId = required(parameters.calendar_id || 'primary', 'Calendar ID', 320);
    const start = required(parameters.start, 'Event start', 80);
    const end = required(parameters.end, 'Event end', 80);
    if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) throw new Error('Calendar start or end is invalid');
    return { url:`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, options:jsonOptions(secret, { summary:required(parameters.summary, 'Event summary', 1_000), description:text(parameters.description).slice(0, 8_000), start:{ dateTime:start }, end:{ dateTime:end } }) };
  }
  if (action === 'zoom.meeting.create') {
    const start = required(parameters.start_time, 'Zoom start time', 80);
    if (Number.isNaN(Date.parse(start))) throw new Error('Zoom start time is invalid');
    return { url:'https://api.zoom.us/v2/users/me/meetings', options:jsonOptions(secret, { topic:required(parameters.topic, 'Zoom topic', 200), type:2, start_time:start, duration:Math.min(1440, Math.max(1, Number(parameters.duration) || 30)), timezone:text(parameters.timezone) || 'UTC', agenda:text(parameters.agenda).slice(0, 2_000) }) };
  }
  if (action === 'calendly.events.list') {
    const url = new URL('https://api.calendly.com/scheduled_events');
    url.searchParams.set('user', required(parameters.user_uri, 'Calendly user URI', 500));
    url.searchParams.set('count', String(Math.min(100, Math.max(1, Number(parameters.count) || 20))));
    return { url:url.toString(), options:{ method:'GET', headers:{ Authorization:`Bearer ${secret}` } } };
  }
  if (action === 'asana.task.create') {
    return { url:'https://app.asana.com/api/1.0/tasks', options:jsonOptions(secret, { data:{ name:required(parameters.name, 'Asana task name', 500), notes:text(parameters.notes).slice(0, 20_000), projects:[identifier(parameters.project_id, 'Asana project ID', /^\d{5,30}$/)] } }) };
  }
  if (action === 'trello.card.create') {
    const form = new URLSearchParams({ idList:identifier(parameters.list_id, 'Trello list ID', /^[A-Za-z0-9]{8,40}$/), name:required(parameters.name, 'Trello card name', 16_384), desc:text(parameters.description).slice(0, 16_384) });
    return { url:'https://api.trello.com/1/cards', options:{ method:'POST', headers:{ Authorization:`Bearer ${secret}`, 'Content-Type':'application/x-www-form-urlencoded' }, body:form.toString() } };
  }
  throw new Error('Connector action is unsupported');
}

async function executeAppConnector(action, parameters, credential) {
  const request = buildAppConnectorRequest(action, parameters, credential.secret);
  const response = await requestPublicUrl(request.url, {
    ...request.options,
    allowedHostSuffix:request.allowedHostSuffix || null,
  });
  return parsePublicResponse(response);
}

export async function executeConnector(config, input, userId) {
  const validated = validateConnectorConfig(config);
  if (validated.errors.length) throw new Error(validated.errors.join('; '));
  const { action, credential_id: credentialId } = validated.value;
  const definition = DEFINITION_MAP.get(action);
  const parameters = renderConnectorParameters(validated.value.parameters, input);
  const credential = await loadConnectorCredential(credentialId, userId, definition);
  let output;
  if (action === 'http.request') output = await executeHttp(parameters, credential);
  else if (action === 'email.send') output = await executeEmail(parameters, credential);
  else if (action === 'slack.message') output = await executeSlack(parameters, credential);
  else if (action === 'google_sheets.append') output = await executeSheets(parameters, credential);
  else if (action === 'google_drive.create_file') output = await executeDrive(parameters, credential);
  else if (action.startsWith('database.')) output = await executeDatabase(action, parameters, credential);
  else if (definition.app_slugs?.length) output = await executeAppConnector(action, parameters, credential);
  else throw new Error('Connector action is unsupported');
  if (credential?.source === 'oauth') {
    await supabase.from('oauth_connections')
      .update({ last_used_at:new Date().toISOString() })
      .eq('id', credential.credential.id)
      .eq('user_id', userId);
  }
  return redact(output, credential?.secret);
}
