import crypto from 'node:crypto';

import { hashDeveloperSecret } from '../lib/developer-platform.js';
import { supabase } from '../lib/supabase.js';

export async function requireDeveloperApiKey(req, res, next) {
  try {
    const raw = developerKeyFromRequest(req);
    if (!raw || !/^afk_live_[A-Za-z0-9_-]{32,}$/.test(raw)) {
      return res.status(401).json(apiError('invalid_api_key', 'A valid AgentForge API key is required'));
    }
    const { data, error } = await supabase.rpc('authenticate_developer_api_key', {
      p_key_hash:hashDeveloperSecret(raw),
    });
    if (error) throw error;
    if (!data?.authenticated) {
      return res.status(401).json(apiError(`api_key_${data?.reason || 'invalid'}`, 'API key is unavailable'));
    }
    req.userId = data.user_id;
    req.apiKeyId = data.api_key_id;
    req.apiKeyScopes = new Set(data.scopes || []);
    req.developerRequestId = safeRequestId(req.get('x-request-id'));
    res.set({
      'X-Request-Id':req.developerRequestId,
      'X-RateLimit-Limit':String(data.rate_limit),
      'X-RateLimit-Remaining':String(data.remaining),
      'X-RateLimit-Reset':new Date(data.reset_at).toISOString(),
    });
    const started = Date.now();
    res.once('finish', () => {
      const context = requestContext(req);
      supabase.from('developer_api_request_logs').insert({
        user_id:req.userId,
        api_key_id:req.apiKeyId,
        request_id:req.developerRequestId,
        method:req.method,
        path:String(req.originalUrl || req.path).slice(0, 500),
        status_code:res.statusCode,
        duration_ms:Math.max(0, Date.now() - started),
        ip_hash:context.ipHash,
        user_agent:context.userAgent,
      }).then(({ error:logError }) => {
        if (logError && logError.code !== '23505') {
          console.error('Developer API request log failed:', logError.message);
        }
      });
    });
    if (!data.allowed) {
      return res.status(429).json(apiError('rate_limit_exceeded', 'API key rate limit exceeded'));
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireDeveloperScope(scope) {
  return (req, res, next) => {
    if (!req.apiKeyScopes?.has(scope)) {
      return res.status(403).json(apiError('insufficient_scope', `API key needs ${scope}`));
    }
    next();
  };
}

export function apiError(code, message, details = undefined) {
  return {
    error:{
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}

function developerKeyFromRequest(req) {
  const explicit = String(req.get('x-agentforge-key') || '').trim();
  if (explicit) return explicit;
  const authorization = String(req.get('authorization') || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function safeRequestId(value) {
  const candidate = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{8,100}$/.test(candidate)
    ? candidate : `req_${crypto.randomUUID()}`;
}

function requestContext(req) {
  const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  const remote = forwarded || req.ip || '';
  const salt = process.env.AUDIT_IP_HASH_SALT
    || process.env.CREDENTIAL_ENCRYPTION_KEY
    || 'agentforge-developer-api';
  return {
    ipHash:remote ? crypto.createHmac('sha256', salt).update(remote).digest('hex') : null,
    userAgent:String(req.get('user-agent') || '').slice(0, 240) || null,
  };
}
