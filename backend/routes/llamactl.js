const express = require('express');
const router = express.Router();
const manager = require('../llama');

// GET current status
router.get('/status', (req, res) => {
  res.json(manager.getState());
});

// POST start with a model
router.post('/start', async (req, res) => {
  const { model_path, threads, gpu_layers, ctx_size, batch_size } = req.body;
  if (!model_path) return res.status(400).json({ error: 'model_path required' });
  try {
    manager.start(model_path, { threads, gpu_layers, ctx_size, batch_size });
    res.json({ ok: true, status: 'starting' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST stop
router.post('/stop', async (req, res) => {
  try {
    await manager.stop();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST restart with optional new model
router.post('/restart', async (req, res) => {
  try {
    const db = require('../db/database');
    const modelPath = req.body.model_path ||
      db.prepare("SELECT value FROM settings WHERE key='llama_active_model'").get()?.value;
    if (!modelPath) return res.status(400).json({ error: 'No model loaded' });
    manager.restart(modelPath, req.body);
    res.json({ ok: true, status: 'restarting' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET live logs via SSE
router.get('/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send backlog
  const backlog = manager.getState().logs;
  for (const entry of backlog) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  const onLog = (entry) => res.write(`data: ${JSON.stringify(entry)}\n\n`);
  const onState = (state) => res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);

  manager.on('log', onLog);
  manager.on('state', onState);

  req.on('close', () => {
    manager.off('log', onLog);
    manager.off('state', onState);
  });
});

module.exports = router;
