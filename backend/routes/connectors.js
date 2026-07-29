import { Router } from 'express';

import { CONNECTOR_DEFINITIONS } from '../lib/connectors.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (_req, res) => {
  res.json(CONNECTOR_DEFINITIONS);
});

export default router;

