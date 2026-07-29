import { Router } from 'express';

import {
  buildRecoveryManifest,
  getPlatformStatus,
  runLaunchReadiness,
  verifyRecoveryManifest,
} from '../lib/launch-readiness.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const ONBOARDING_STEPS = ['profile', 'agent', 'workflow', 'guardrails', 'developer', 'recovery'];

router.get('/status', async (_req, res, next) => {
  try {
    const status = await getPlatformStatus();
    res.status(status.status === 'operational' ? 200 : 503).json(status);
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [onboarding, snapshots, verifications, readiness, status] = await Promise.all([
      one('user_onboarding_progress', query => query.eq('user_id', req.userId)),
      many('recovery_snapshots', query => query.eq('user_id', req.userId)
        .order('created_at', { ascending:false }).limit(25)),
      many('recovery_verifications', query => query.eq('user_id', req.userId)
        .order('verified_at', { ascending:false }).limit(25)),
      many('launch_readiness_runs', query => query.eq('user_id', req.userId)
        .order('created_at', { ascending:false }).limit(25)),
      getPlatformStatus(),
    ]);
    res.json({
      onboarding,
      onboarding_steps:ONBOARDING_STEPS,
      recovery_snapshots:snapshots.map(({ manifest, ...item }) => ({
        ...item,
        manifest_included:false,
        format:manifest?.format,
      })),
      recovery_verifications:verifications,
      readiness_runs:readiness,
      platform_status:status,
      recovery_policy:{
        secrets_excluded:true,
        dry_run_only:true,
        retention_days:30,
        maximum_manifest_bytes:2_000_000,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/onboarding', async (req, res, next) => {
  try {
    const requested = Array.isArray(req.body?.completed_steps)
      ? [...new Set(req.body.completed_steps.map(String))]
      : [];
    if (requested.some(step => !ONBOARDING_STEPS.includes(step))) {
      return res.status(400).json({ error:'Onboarding step is invalid' });
    }
    const complete = ONBOARDING_STEPS.every(step => requested.includes(step));
    const currentStep = complete ? 'complete'
      : ONBOARDING_STEPS.find(step => !requested.includes(step)) || 'profile';
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('user_onboarding_progress')
      .upsert({
        user_id:req.userId,
        completed_steps:requested,
        current_step:currentStep,
        dismissed_at:req.body?.dismissed === true ? now : null,
        completed_at:complete ? now : null,
        updated_at:now,
      }, { onConflict:'user_id' })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/recovery-snapshots', async (req, res, next) => {
  try {
    const { manifest, hash, resourceCounts } = await buildRecoveryManifest(req.userId);
    const { data, error } = await supabase
      .from('recovery_snapshots')
      .insert({
        user_id:req.userId,
        schema_version:manifest.schema_version,
        manifest,
        manifest_sha256:hash,
        resource_counts:resourceCounts,
        expires_at:new Date(Date.now() + 30 * 86400000).toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({
      ...data,
      manifest:undefined,
      download_url:`/api/launch/recovery-snapshots/${data.id}/download`,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/recovery-snapshots/:id/download', async (req, res, next) => {
  try {
    const snapshot = await ownedSnapshot(req.params.id, req.userId);
    if (!snapshot) return res.status(404).json({ error:'Recovery snapshot not found' });
    const body = JSON.stringify(snapshot.manifest, null, 2);
    res.set({
      'Content-Type':'application/json; charset=utf-8',
      'Content-Disposition':`attachment; filename="agentforge-recovery-${snapshot.id}.json"`,
      'X-AgentForge-Recovery-SHA256':snapshot.manifest_sha256,
      'Cache-Control':'no-store',
    });
    res.send(body);
  } catch (error) {
    next(error);
  }
});

router.post('/recovery-snapshots/:id/verify', async (req, res, next) => {
  try {
    const snapshot = await ownedSnapshot(req.params.id, req.userId);
    if (!snapshot) return res.status(404).json({ error:'Recovery snapshot not found' });
    if (snapshot.status !== 'ready' || new Date(snapshot.expires_at) <= new Date()) {
      return res.status(409).json({ error:'Recovery snapshot is expired' });
    }
    const verification = verifyRecoveryManifest(snapshot, req.userId);
    const { data, error } = await supabase
      .from('recovery_verifications')
      .insert({
        snapshot_id:snapshot.id,
        user_id:req.userId,
        status:verification.status,
        checks:verification.checks,
        verified_sha256:verification.hash,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(verification.status === 'passed' ? 200 : 409).json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/readiness', async (req, res, next) => {
  try {
    const result = await runLaunchReadiness(req.userId);
    const { data, error } = await supabase
      .from('launch_readiness_runs')
      .insert({
        user_id:req.userId,
        release_version:String(
          process.env.RENDER_GIT_COMMIT || req.body?.release_version || 'roadmap-day-21',
        ).slice(0, 100),
        status:result.status,
        score:result.score,
        checks:result.checks,
        environment_summary:result.environment,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(result.status === 'failed' ? 503 : 200).json({
      ...data,
      platform:result.platform,
    });
  } catch (error) {
    next(error);
  }
});

async function ownedSnapshot(id, userId) {
  const { data, error } = await supabase.from('recovery_snapshots').select('*')
    .eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function one(table, configure) {
  const { data, error } = await configure(supabase.from(table).select('*')).maybeSingle();
  if (error) throw error;
  return data;
}

async function many(table, configure) {
  const { data, error } = await configure(supabase.from(table).select('*'));
  if (error) throw error;
  return data || [];
}

export default router;
