import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import agentsRouter from './routes/agents.js';
import runsRouter from './routes/runs.js';
import templatesRouter from './routes/templates.js';
import dashboardRouter from './routes/dashboard.js';
import chainsRouter from './routes/chains.js';
import jobsRouter from './routes/jobs.js';
import workflowsRouter from './routes/workflows.js';
import { getEngineHealth } from './lib/engine.js';
import { startJobWorker } from './lib/job-worker.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Route Definitions
app.use('/api/agents', agentsRouter);
app.use('/api/runs', runsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/chains', chainsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/workflows', workflowsRouter);
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
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

const server = app.listen(PORT, () => {
  console.log(`AgentForge API running on port ${PORT}`);
});
const stopWorker = startJobWorker();

function shutdown(signal) {
  console.log(`${signal} received; stopping AgentForge`);
  stopWorker();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
