import { Router } from 'express';

import {
  createIntegrationConnectLink,
  integrationBridgeConfig,
} from '../lib/integration-bridge.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/status', (_req, res) => {
  const config = integrationBridgeConfig();
  res.json({
    configured:config.configured,
    environment:config.environment,
    provider:'pipedream',
  });
});

router.post('/connect-link', requireAuth, async (req, res, next) => {
  try {
    const frontendUrl = String(process.env.FRONTEND_URL || '').split(',')[0].trim();
    if (!frontendUrl) {
      const error = new Error('Frontend URL is not configured for app connection redirects');
      error.status = 503;
      throw error;
    }
    const result = await createIntegrationConnectLink({
      userId:req.userId,
      appSlug:req.body?.app,
      frontendUrl,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
