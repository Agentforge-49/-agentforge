import { Router } from 'express';

import { buildActivationSummary } from '../lib/activation.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [
      profile, credentials, oauth, agents, workflows, firstRun, recentRuns,
      resolvedApprovals, pendingApprovals, qualitySuites, verifiedRecoveries,
    ] = await Promise.all([
      one('profiles', 'created_at', query => query.eq('id', req.userId)),
      count('vault_credentials', query => query.eq('user_id', req.userId)),
      count('oauth_connections', query => query.eq('user_id', req.userId).eq('status', 'active')),
      count('agents', query => query.eq('user_id', req.userId).not('published_version_id', 'is', null)),
      count('workflows', query => query.eq('user_id', req.userId).eq('status', 'active')),
      one('run_observability', 'created_at', query => query.eq('user_id', req.userId)
        .order('created_at', { ascending:true }).limit(1)),
      many('run_observability', 'status', query => query.eq('user_id', req.userId)
        .gte('created_at', since).limit(1000)),
      count('approval_requests', query => query.eq('user_id', req.userId)
        .in('status', ['approved', 'edited', 'rejected'])),
      count('approval_requests', query => query.eq('user_id', req.userId).eq('status', 'pending')),
      count('evaluation_suites', query => query.eq('user_id', req.userId)),
      count('recovery_verifications', query => query.eq('user_id', req.userId).eq('status', 'passed')),
    ]);

    res.json(buildActivationSummary({
      profileCreatedAt:profile?.created_at,
      connections:credentials + oauth,
      publishedAgents:agents,
      activeWorkflows:workflows,
      totalRuns:recentRuns.length || (firstRun ? 1 : 0),
      firstRunAt:firstRun?.created_at,
      recentRunStatuses:recentRuns.map(run => run.status),
      resolvedApprovals,
      pendingApprovals,
      qualitySuites,
      verifiedRecoveries,
    }));
  } catch (error) {
    next(error);
  }
});

async function one(table, select, configure) {
  const { data, error } = await configure(supabase.from(table).select(select)).maybeSingle();
  if (error) throw error;
  return data;
}

async function many(table, select, configure) {
  const { data, error } = await configure(supabase.from(table).select(select));
  if (error) throw error;
  return data || [];
}

async function count(table, configure) {
  const { count:rowCount, error } = await configure(
    supabase.from(table).select('id', { count:'exact', head:true }),
  );
  if (error) throw error;
  return rowCount || 0;
}

export default router;

