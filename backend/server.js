import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import agentsRouter from './routes/agents.js';
import runsRouter from './routes/runs.js';
import templatesRouter from './routes/templates.js';
import dashboardRouter from './routes/dashboard.js';
import chainsRouter from './routes/chains.js';

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
// Base Diagnostics
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Structural Fallback Error Capture Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Exception:', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`AgentForge API running on port ${PORT}`);
});