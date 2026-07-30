import crypto from 'node:crypto';
import { Router } from 'express';

import { encryptSecret } from '../lib/credential-vault.js';
import {
  OAUTH_PROVIDERS,
  buildAuthorizationUrl,
  createOauthState,
  exchangeAuthorizationCode,
  fetchOauthProfile,
  hashOauthNonce,
  oauthProvider,
  oauthProviderStatus,
  safeOauthRedirect,
  verifyOauthState,
} from '../lib/oauth.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function publicApiUrl() {
  return String(process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3001}`)
    .replace(/\/$/, '');
}

function callbackUrl(provider) {
  return `${publicApiUrl()}/api/oauth/callback/${provider}`;
}

function safeConnection(connection) {
  return {
    id:connection.id,
    provider:connection.provider,
    provider_account_id:connection.provider_account_id,
    provider_account_name:connection.provider_account_name,
    scopes:connection.scopes || [],
    status:connection.status,
    access_token_expires_at:connection.access_token_expires_at,
    last_used_at:connection.last_used_at,
    created_at:connection.created_at,
    updated_at:connection.updated_at,
  };
}

router.get('/providers', requireAuth, (_req, res) => {
  res.json(Object.keys(OAUTH_PROVIDERS).map(oauthProviderStatus));
});

router.get('/connections', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending:false });
    if (error) throw error;
    res.json((data || []).map(safeConnection));
  } catch (error) {
    next(error);
  }
});

router.post('/:provider/start', requireAuth, async (req, res, next) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    oauthProvider(provider);
    const nonce = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const redirectPath = typeof req.body?.redirect_path === 'string'
      && /^\/[A-Za-z0-9/_-]*$/.test(req.body.redirect_path)
      ? req.body.redirect_path
      : '/credentials';
    const { error } = await supabase.from('oauth_authorization_requests').insert({
      user_id:req.userId,
      provider,
      nonce_hash:hashOauthNonce(nonce),
      redirect_path:redirectPath,
      expires_at:expiresAt,
    });
    if (error) throw error;
    const state = createOauthState({
      userId:req.userId,
      provider,
      nonce,
      expiresAt,
    });
    res.json({
      provider,
      authorization_url:buildAuthorizationUrl(provider, state, callbackUrl(provider)),
      expires_at:expiresAt,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/callback/:provider', async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  try {
    oauthProvider(provider);
    if (req.query.error) {
      return res.redirect(safeOauthRedirect('cancelled', provider));
    }
    const state = verifyOauthState(req.query.state);
    if (state.provider !== provider || typeof req.query.code !== 'string') {
      throw new Error('OAuth callback is invalid');
    }
    const nonceHash = hashOauthNonce(state.nonce);
    const consumedAt = new Date().toISOString();
    const { data:request, error:consumeError } = await supabase
      .from('oauth_authorization_requests')
      .update({ consumed_at:consumedAt })
      .eq('user_id', state.sub)
      .eq('provider', provider)
      .eq('nonce_hash', nonceHash)
      .is('consumed_at', null)
      .gt('expires_at', consumedAt)
      .select('*')
      .maybeSingle();
    if (consumeError || !request) throw new Error('OAuth request expired or was already used');

    const token = await exchangeAuthorizationCode(provider, req.query.code, callbackUrl(provider));
    const accessToken = token.access_token;
    const refreshToken = token.refresh_token || null;
    const profile = await fetchOauthProfile(provider, accessToken);
    if (!profile.id) throw new Error('OAuth account identity is unavailable');

    const { data:existing, error:existingError } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('user_id', state.sub)
      .eq('provider', provider)
      .eq('provider_account_id', profile.id)
      .maybeSingle();
    if (existingError) throw existingError;
    const connectionId = existing?.id || crypto.randomUUID();
    const encryptedAccess = encryptSecret(
      accessToken,
      `oauth:${state.sub}:${connectionId}:access`,
    );
    const encryptedRefresh = refreshToken
      ? encryptSecret(refreshToken, `oauth:${state.sub}:${connectionId}:refresh`)
      : existing?.encrypted_refresh_token || null;
    const expiresIn = Number(token.expires_in);
    const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;
    const scopes = String(token.scope || '')
      .split(/[,\s]+/)
      .map(value => value.trim())
      .filter(Boolean);
    const record = {
      id:connectionId,
      user_id:state.sub,
      provider,
      provider_account_id:profile.id,
      provider_account_name:profile.name,
      scopes,
      encrypted_access_token:encryptedAccess,
      encrypted_refresh_token:encryptedRefresh,
      access_token_expires_at:expiresAt,
      status:'active',
      metadata:{
        token_type:String(token.token_type || 'Bearer').slice(0, 40),
        scope_source:scopes.length ? 'provider' : 'configured',
      },
    };
    const { error:upsertError } = await supabase
      .from('oauth_connections')
      .upsert(record, { onConflict:'user_id,provider,provider_account_id' });
    if (upsertError) throw upsertError;
    return res.redirect(safeOauthRedirect('connected', provider));
  } catch (error) {
    console.error(`OAuth callback failed for ${provider}:`, error.message);
    return res.redirect(safeOauthRedirect('error', provider, 'Connection could not be completed'));
  }
});

router.delete('/connections/:id', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('oauth_connections')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'OAuth connection not found' });
    res.json({ success:true });
  } catch (error) {
    next(error);
  }
});

export default router;
