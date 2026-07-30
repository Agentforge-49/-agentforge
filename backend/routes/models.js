import { Router } from 'express';

import { getEngineHealth } from '../lib/engine.js';
import { MODEL_CATALOG } from '../lib/model-catalog.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  let engineModels = [];
  let engineStatus = 'unavailable';
  try {
    const health = await getEngineHealth();
    engineModels = Array.isArray(health.supported_models) ? health.supported_models : [];
    engineStatus = health.status === 'ok' ? 'available' : 'degraded';
  } catch {
    engineStatus = 'unavailable';
  }

  const availability = new Map(engineModels.map(model => [model.id, Boolean(model.available)]));
  const models = Object.entries(MODEL_CATALOG).map(([id, definition]) => ({
    id,
    label:definition.label,
    provider:definition.provider,
    available:availability.get(id) || false,
  }));
  res.json({ engine_status:engineStatus, models });
});

export default router;
