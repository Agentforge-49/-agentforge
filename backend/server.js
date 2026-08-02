import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import crypto from 'node:crypto';

import agentsRouter from './routes/agents.js';
import runsRouter from './routes/runs.js';
import templatesRouter from './routes/templates.js';
import dashboardRouter from './routes/dashboard.js';
import chainsRouter from './routes/chains.js';
import jobsRouter from './routes/jobs.js';
import workflowsRouter from './routes/workflows.js';
import workflowCopilotRouter from './routes/workflow-copilot.js';
import triggersRouter from './routes/triggers.js';
import webhooksRouter from './routes/webhooks.js';
import credentialsRouter from './routes/credentials.js';
import oauthRouter from './routes/oauth.js';
import modelsRouter from './routes/models.js';
import connectorsRouter from './routes/connectors.js';
import approvalsRouter from './routes/approvals.js';
import observabilityRouter from './routes/observability.js';
import evaluationsRouter from './routes/evaluations.js';
import knowledgeRouter from './routes/knowledge.js';
import multiAgentsRouter from './routes/multi-agents.js';
import marketplaceRouter from './routes/marketplace.js';
import usageRouter from './routes/usage.js';
import organizationsRouter from './routes/organizations.js';
import enterpriseRouter from './routes/enterprise.js';
import billingRouter from './routes/billing.js';
import developerRouter from './routes/developer.js';
import publicApiRouter from './routes/public-api.js';
import launchRouter from './routes/launch.js';
import settingsRouter from './routes/settings.js';
import { getEngineHealth } from './lib/engine.js';
import { startJobWorker } from './lib/job-worker.js';
import { startTriggerScheduler } from './lib/trigger-scheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const allowedOrigins = new Set(
  String(process.env.FRONTEND_URL || '')
    .split(',')
    .map(value => value.trim().replace(/\/$/, ''))
    .filter(Boolean),
);

app.disable('x-powered-by');
app.use(helmet());
app.use((req, res, next) => {
  req.requestId = String(req.headers['x-request-id'] || crypto.randomUUID()).slice(0, 100);
  res.setHeader('X-Request-Id', req.requestId);
  next();
});
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  },
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) {
      callback(null, true);
      return;
    }
    const error = new Error('Origin is not allowed');
    error.status = 403;
    callback(error);
  },
  credentials: true,
  exposedHeaders:[
    'Content-Disposition', 'X-AgentForge-Content-SHA256', 'X-AgentForge-Audit-Records',
    'X-AgentForge-Recovery-SHA256', 'X-Request-Id',
    'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset',
  ],
}));

// Route Definitions
app.use('/api/agents', agentsRouter);
app.use('/api/runs', runsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/chains', chainsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/workflow-copilot', workflowCopilotRouter);
app.use('/api/triggers', triggersRouter);
app.use('/api/credentials', credentialsRouter);
app.use('/api/oauth', oauthRouter);
app.use('/api/models', modelsRouter);
app.use('/api/connectors', connectorsRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/observability', observabilityRouter);
app.use('/api/evaluations', evaluationsRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/multi-agents', multiAgentsRouter);
app.use('/api/marketplace', marketplaceRouter);
app.use('/api/usage', usageRouter);
app.use('/api/organizations', organizationsRouter);
app.use('/api/enterprise', enterpriseRouter);
app.use('/api/billing', billingRouter);
app.use('/api/developer', developerRouter);
app.use('/api/v1', publicApiRouter);
app.use('/api/launch', launchRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/webhooks', webhooksRouter);
// Base Diagnostics
app.get('/health', async (req, res) => {
  try {
    const engine = await getEngineHealth();
    res.status(200).json({
      status: 'ok',
      timestamp: new Date(),
      engine: engine.status,
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      timestamp: new Date(),
      engine: 'unavailable',
    });
  }
});

// Structural Fallback Error Capture Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Exception:', err);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status : 500;
  const message = status >= 500 ? 'Internal Server Error'
    : err.message || 'Request failed';
  res.status(status).json({ error:message, request_id:req.requestId });
});

const server = app.listen(PORT, () => {
  console.log(`AgentForge API running on port ${PORT}`);
});
const stopWorker = startJobWorker();
const stopScheduler = startTriggerScheduler();

function shutdown(signal) {
  console.log(`${signal} received; stopping AgentForge`);
  stopWorker();
  stopScheduler();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
