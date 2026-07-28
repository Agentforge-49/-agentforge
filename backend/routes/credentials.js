import crypto from 'node:crypto';
import { Router } from 'express';

import {
  decryptSecret,
  encryptSecret,
  maskCredential,
  testCredentialConnection,
  validateCredentialInput,
} from '../lib/credential-vault.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function safeCredential(credential) {
  return {
    id: credential.id,
    name: credential.name,
    provider: credential.provider,
    masked_secret: maskCredential(credential.last_four),
    current_version: credential.current_version,
    metadata: credential.metadata || {},
    last_test_status: credential.last_test_status,
    last_tested_at: credential.last_tested_at,
    rotated_at: credential.rotated_at,
    created_at: credential.created_at,
    updated_at: credential.updated_at,
  };
}

async function ownedCredential(id, userId) {
  const { data, error } = await supabase
    .from('vault_credentials')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  return error ? null : data;
}

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('vault_credentials')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(safeCredential));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const validated = validateCredentialInput(req.body || {});
    if (validated.errors.length) {
      return res.status(400).json({ error: validated.errors[0], details: validated.errors });
    }
    const id = crypto.randomUUID();
    const encrypted = encryptSecret(
      validated.value.secret,
      `credential:${req.userId}:${id}:1`,
    );
    const { data, error } = await supabase.rpc('create_vault_credential', {
      p_id: id,
      p_user_id: req.userId,
      p_name: validated.value.name,
      p_provider: validated.value.provider,
      p_last_four: encrypted.last_four,
      p_fingerprint: encrypted.fingerprint,
      p_metadata: validated.value.metadata || {},
      p_ciphertext: encrypted.ciphertext,
      p_initialization_vector: encrypted.initialization_vector,
      p_authentication_tag: encrypted.authentication_tag,
      p_key_version: encrypted.key_version,
    });
    if (error) {
      const status = /unique/i.test(error.message) ? 409 : 400;
      return res.status(status).json({ error: status === 409 ? 'Credential name already exists' : error.message });
    }
    res.status(201).json(safeCredential(data));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const credential = await ownedCredential(req.params.id, req.userId);
    if (!credential) return res.status(404).json({ error: 'Credential not found' });
    const validated = validateCredentialInput(req.body || {}, { partial: true });
    if (validated.errors.length) {
      return res.status(400).json({ error: validated.errors[0], details: validated.errors });
    }
    const update = {};
    if (validated.value.name) update.name = validated.value.name;
    if (validated.value.metadata) update.metadata = validated.value.metadata;
    if (!Object.keys(update).length) return res.status(400).json({ error: 'No changes provided' });
    const { data, error } = await supabase
      .from('vault_credentials')
      .update(update)
      .eq('id', credential.id)
      .eq('user_id', req.userId)
      .select()
      .single();
    if (error) throw error;
    await supabase.from('credential_access_logs').insert({
      credential_id: data.id,
      user_id: req.userId,
      credential_name: data.name,
      operation: 'update',
      outcome: 'success',
    });
    res.json(safeCredential(data));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/rotate', async (req, res, next) => {
  try {
    const credential = await ownedCredential(req.params.id, req.userId);
    if (!credential) return res.status(404).json({ error: 'Credential not found' });
    const validated = validateCredentialInput({ secret: req.body?.secret }, { partial: true });
    if (validated.errors.length || !validated.value.secret) {
      return res.status(400).json({ error: validated.errors[0] || 'A replacement secret is required' });
    }
    const nextVersion = credential.current_version + 1;
    const encrypted = encryptSecret(
      validated.value.secret,
      `credential:${req.userId}:${credential.id}:${nextVersion}`,
    );
    const { data, error } = await supabase.rpc('rotate_vault_credential', {
      p_credential_id: credential.id,
      p_user_id: req.userId,
      p_last_four: encrypted.last_four,
      p_fingerprint: encrypted.fingerprint,
      p_ciphertext: encrypted.ciphertext,
      p_initialization_vector: encrypted.initialization_vector,
      p_authentication_tag: encrypted.authentication_tag,
      p_key_version: encrypted.key_version,
    });
    if (error) throw error;
    res.json(safeCredential(data));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/test', async (req, res, next) => {
  try {
    const credential = await ownedCredential(req.params.id, req.userId);
    if (!credential) return res.status(404).json({ error: 'Credential not found' });
    const { data: version, error } = await supabase
      .from('vault_credential_versions')
      .select('*')
      .eq('credential_id', credential.id)
      .eq('user_id', req.userId)
      .eq('version', credential.current_version)
      .single();
    if (error || !version) return res.status(409).json({ error: 'Credential version is unavailable' });
    const secret = decryptSecret(
      version,
      `credential:${req.userId}:${credential.id}:${credential.current_version}`,
    );
    const result = await testCredentialConnection(credential.provider, secret);
    const testedAt = new Date().toISOString();
    await Promise.all([
      supabase.from('vault_credentials').update({
        last_test_status: result.passed ? 'passed' : 'failed',
        last_tested_at: testedAt,
      }).eq('id', credential.id).eq('user_id', req.userId),
      supabase.from('credential_access_logs').insert({
        credential_id: credential.id,
        user_id: req.userId,
        credential_name: credential.name,
        operation: 'test',
        outcome: result.passed ? 'success' : 'failure',
        details: result.message,
      }),
    ]);
    res.json({
      passed: result.passed,
      message: result.message,
      tested_at: testedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/access/logs', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('credential_access_logs')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const credential = await ownedCredential(req.params.id, req.userId);
    if (!credential) return res.status(404).json({ error: 'Credential not found' });
    await supabase.from('credential_access_logs').insert({
      credential_id: credential.id,
      user_id: req.userId,
      credential_name: credential.name,
      operation: 'delete',
      outcome: 'success',
    });
    const { error } = await supabase
      .from('vault_credentials')
      .delete()
      .eq('id', credential.id)
      .eq('user_id', req.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
