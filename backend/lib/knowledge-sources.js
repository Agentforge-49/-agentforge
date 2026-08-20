import { loadConnectorCredential } from './connectors.js';
import { parsePublicResponse, requestPublicUrl } from './safe-http.js';

export const MAX_KNOWLEDGE_FILE_BYTES = 5_000_000;
export const MAX_KNOWLEDGE_TEXT_LENGTH = 1_000_000;
export const NOTION_API_VERSION = '2026-03-11';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const CSV_MIMES = new Set(['text/csv', 'text/tab-separated-values', 'application/csv']);
const TEXT_MIMES = new Set([
  'text/plain', 'text/markdown', 'application/json', 'application/xml', 'text/xml',
]);

function cleanString(value, maxLength = 500) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length <= maxLength ? normalized : '';
}

export function normalizeKnowledgeText(value) {
  const text = String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n')
    .trim();
  if (!text) throw new Error('The source did not contain readable text');
  if (text.length > MAX_KNOWLEDGE_TEXT_LENGTH) {
    throw new Error('Extracted knowledge exceeded 1,000,000 characters');
  }
  return text;
}

function decodeHtmlEntities(value) {
  const named = {
    amp:'&', apos:"'", gt:'>', lt:'<', nbsp:' ', quot:'"',
    mdash:'—', ndash:'–', hellip:'…', rsquo:'’', lsquo:'‘',
    rdquo:'”', ldquo:'“', copy:'©', reg:'®', trade:'™',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? match;
    const hex = entity[1]?.toLowerCase() === 'x';
    const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint) : match;
  });
}

export function htmlToKnowledgeText(html) {
  const bounded = String(html || '').slice(0, 1_500_000);
  const withoutHidden = bounded
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(address|article|aside|blockquote|div|footer|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tr|ul)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return normalizeKnowledgeText(
    decodeHtmlEntities(withoutHidden)
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ *\n */g, '\n'),
  );
}

function detectCsvDelimiter(text) {
  const firstLine = String(text || '').split(/\r?\n/, 1)[0] || '';
  const counts = [[',', ','], ['\t', '\t'], [';', ';']]
    .map(([value, key]) => [value, firstLine.split(key).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] ? counts[0][0] : ',';
}

export function csvToKnowledgeText(value) {
  const input = String(value || '').replace(/^\uFEFF/, '');
  const delimiter = detectCsvDelimiter(input);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, '').trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  row.push(field.replace(/\r$/, '').trim());
  if (row.some(Boolean)) rows.push(row);
  return normalizeKnowledgeText(rows.map(items => items.join(' | ')).join('\n'));
}

function resolvedMimeType(mimeType, fileName) {
  const supplied = cleanString(mimeType, 100).toLowerCase().split(';', 1)[0];
  const lowerName = cleanString(fileName, 255).toLowerCase();
  if (lowerName.endsWith('.pdf')) return PDF_MIME;
  if (lowerName.endsWith('.docx')) return DOCX_MIME;
  if (lowerName.endsWith('.csv')) return 'text/csv';
  if (lowerName.endsWith('.tsv')) return 'text/tab-separated-values';
  if (lowerName.endsWith('.md')) return 'text/markdown';
  if (lowerName.endsWith('.txt')) return 'text/plain';
  return supplied || 'application/octet-stream';
}

export function assertKnowledgeFile(buffer, { mimeType, fileName }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Choose a non-empty file');
  if (buffer.length > MAX_KNOWLEDGE_FILE_BYTES) throw new Error('Knowledge files must be 5 MB or smaller');
  const resolved = resolvedMimeType(mimeType, fileName);
  if (resolved === PDF_MIME && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('The uploaded file is not a valid PDF');
  }
  if (resolved === DOCX_MIME && buffer.subarray(0, 2).toString('ascii') !== 'PK') {
    throw new Error('The uploaded file is not a valid DOCX file');
  }
  if (!TEXT_MIMES.has(resolved) && !CSV_MIMES.has(resolved)
    && resolved !== PDF_MIME && resolved !== DOCX_MIME) {
    throw new Error('Supported files are PDF, DOCX, CSV, TXT, Markdown, JSON, and XML');
  }
  return resolved;
}

export async function extractKnowledgeFile(buffer, { mimeType, fileName }) {
  const resolved = assertKnowledgeFile(buffer, { mimeType, fileName });
  if (resolved === PDF_MIME) {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data:Uint8Array.from(buffer) });
    try {
      const result = await parser.getText();
      return { text:normalizeKnowledgeText(result.text), mimeType:resolved, pages:result.total || null };
    } finally {
      await parser.destroy();
    }
  }
  if (resolved === DOCX_MIME) {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ buffer });
    return {
      text:normalizeKnowledgeText(result.value),
      mimeType:resolved,
      warnings:(result.messages || []).map(item => item.message).filter(Boolean).slice(0, 10),
    };
  }
  const decoded = buffer.toString('utf8');
  return {
    text:CSV_MIMES.has(resolved) ? csvToKnowledgeText(decoded) : normalizeKnowledgeText(decoded),
    mimeType:resolved,
  };
}

function knowledgeResponseError(response, label) {
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) {
    throw new Error(`${label} access was denied; reconnect the credential or share the source`);
  }
  if (response.status === 404) throw new Error(`${label} was not found or is not shared with this connection`);
  if (response.status === 429) throw new Error(`${label} is rate limited; retry in a moment`);
  throw new Error(`${label} returned ${response.status}`);
}

export async function fetchWebsiteKnowledge(urlValue) {
  const response = await requestPublicUrl(urlValue, {
    method:'GET',
    headers:{ Accept:'text/html,text/plain;q=0.9' },
    maxResponseBytes:1_500_000,
    timeoutMs:20_000,
  });
  knowledgeResponseError(response, 'Website');
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new Error('Website import supports HTML and plain-text pages');
  }
  return {
    title:new URL(urlValue).hostname,
    text:contentType.includes('text/html')
      ? htmlToKnowledgeText(response.bodyText) : normalizeKnowledgeText(response.bodyText),
    mimeType:contentType.split(';', 1)[0],
    sourceUri:String(urlValue),
  };
}

function driveFileId(value) {
  const normalized = cleanString(value, 200);
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(normalized)) throw new Error('Google Drive file ID is invalid');
  return normalized;
}

export async function fetchGoogleDriveKnowledge(configuration, userId) {
  const fileId = driveFileId(configuration.file_id);
  const credential = await loadConnectorCredential(configuration.credential_id, userId, {
    name:'Google Drive knowledge source',
    providers:['google', 'generic'],
    app_slugs:['google_drive'],
  });
  const headers = { Authorization:`Bearer ${credential.secret}` };
  const metadataResponse = await requestPublicUrl(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,webViewLink,size`,
    { method:'GET', headers:{ ...headers, Accept:'application/json' }, allowedHostSuffix:'.googleapis.com' },
  );
  knowledgeResponseError(metadataResponse, 'Google Drive file');
  const metadata = parsePublicResponse(metadataResponse);
  let downloadUrl;
  let mimeType = metadata.mimeType;
  if (mimeType === 'application/vnd.google-apps.document') {
    mimeType = 'text/plain';
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text%2Fplain`;
  } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    mimeType = 'text/csv';
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text%2Fcsv`;
  } else if (mimeType === 'application/vnd.google-apps.presentation') {
    mimeType = PDF_MIME;
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application%2Fpdf`;
  } else if (String(mimeType).startsWith('application/vnd.google-apps.')) {
    throw new Error('This Google Workspace file type cannot be converted to readable knowledge');
  } else {
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  }
  const contentResponse = await requestPublicUrl(downloadUrl, {
    method:'GET', headers, allowedHostSuffix:'.googleapis.com',
    maxResponseBytes:MAX_KNOWLEDGE_FILE_BYTES, timeoutMs:30_000, responseType:'buffer',
  });
  knowledgeResponseError(contentResponse, 'Google Drive file');
  const extracted = await extractKnowledgeFile(contentResponse.bodyBuffer, {
    mimeType,
    fileName:metadata.name,
  });
  return {
    ...extracted,
    title:cleanString(metadata.name, 200) || 'Google Drive file',
    sourceUri:cleanString(metadata.webViewLink, 2000) || `https://drive.google.com/open?id=${fileId}`,
    providerMetadata:{ modified_time:metadata.modifiedTime || null, provider_file_id:fileId },
  };
}

function notionId(value) {
  const normalized = cleanString(value, 100).replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(normalized)) throw new Error('Notion page ID is invalid');
  return normalized.match(/.{1,8}/g).join('-');
}

function notionRichText(items) {
  return Array.isArray(items)
    ? items.map(item => cleanString(item?.plain_text, 100_000)).filter(Boolean).join('')
    : '';
}

export function notionBlockText(block) {
  if (!block || typeof block !== 'object') return '';
  const value = block[block.type] || {};
  if (block.type === 'table_row') {
    return (value.cells || []).map(notionRichText).filter(Boolean).join(' | ');
  }
  if (['child_page', 'child_database'].includes(block.type)) return cleanString(value.title, 1000);
  if (block.type === 'equation') return cleanString(value.expression, 1000);
  if (block.type === 'bookmark' || block.type === 'embed' || block.type === 'link_preview') {
    return cleanString(value.url, 2000);
  }
  return notionRichText(value.rich_text || value.caption || value.title || []);
}

async function notionJson(url, secret) {
  const response = await requestPublicUrl(url, {
    method:'GET',
    headers:{
      Authorization:`Bearer ${secret}`,
      Accept:'application/json',
      'Notion-Version':NOTION_API_VERSION,
    },
    allowedHostSuffix:'.notion.com',
    maxResponseBytes:1_000_000,
    timeoutMs:20_000,
  });
  knowledgeResponseError(response, 'Notion page');
  return parsePublicResponse(response);
}

async function notionChildren(blockId, secret, state, depth = 0) {
  if (depth > 4 || state.blocks >= 500) return [];
  const output = [];
  let cursor = '';
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${encodeURIComponent(blockId)}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const page = await notionJson(url.toString(), secret);
    for (const block of page.results || []) {
      state.blocks += 1;
      const value = notionBlockText(block);
      if (value) output.push(value);
      if (block.has_children && state.blocks < 500) {
        output.push(...await notionChildren(block.id, secret, state, depth + 1));
      }
      if (state.blocks >= 500) break;
    }
    cursor = page.has_more && page.next_cursor ? page.next_cursor : '';
  } while (cursor && state.blocks < 500);
  return output;
}

function notionPageTitle(page) {
  for (const property of Object.values(page?.properties || {})) {
    if (property?.type === 'title') {
      const title = notionRichText(property.title);
      if (title) return title;
    }
  }
  return 'Notion page';
}

export async function fetchNotionKnowledge(configuration, userId) {
  const pageId = notionId(configuration.page_id);
  const credential = await loadConnectorCredential(configuration.credential_id, userId, {
    name:'Notion knowledge source', providers:['generic'], app_slugs:['notion'],
  });
  const page = await notionJson(`https://api.notion.com/v1/pages/${encodeURIComponent(pageId)}`, credential.secret);
  const state = { blocks:0 };
  const lines = await notionChildren(pageId, credential.secret, state);
  return {
    title:notionPageTitle(page),
    text:normalizeKnowledgeText(lines.join('\n')),
    mimeType:'text/plain',
    sourceUri:cleanString(page.url, 2000) || `https://www.notion.so/${pageId.replace(/-/g, '')}`,
    providerMetadata:{ provider_page_id:pageId, last_edited_time:page.last_edited_time || null, blocks:state.blocks },
  };
}

export async function fetchRemoteKnowledgeSource(source, userId) {
  if (source.source_type === 'website') return fetchWebsiteKnowledge(source.configuration?.url);
  if (source.source_type === 'google_drive') return fetchGoogleDriveKnowledge(source.configuration || {}, userId);
  if (source.source_type === 'notion') return fetchNotionKnowledge(source.configuration || {}, userId);
  throw new Error('This source type must be uploaded from your device');
}

