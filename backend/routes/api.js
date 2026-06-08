const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const { executeTool, WORKSPACE_DIR, QUARANTINE_DIR } = require('../tools/executor');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, WORKSPACE_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// ─── TOOLS ────────────────────────────────────────────────────────────────────
router.get('/tools', (req, res) => {
  const tools = db.prepare('SELECT * FROM tools ORDER BY name').all();
  res.json(tools.map(t => ({ ...t, config: JSON.parse(t.config) })));
});

router.post('/tools', (req, res) => {
  const { name, description, type, config } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO tools (id, name, description, type, config) VALUES (?, ?, ?, ?, ?)').run(
    id, name, description, type, JSON.stringify(config || {})
  );
  res.json({ id });
});

router.put('/tools/:id', (req, res) => {
  const { name, description, config, enabled } = req.body;
  db.prepare(`UPDATE tools SET name=?, description=?, config=?, enabled=?, updated_at=datetime('now') WHERE id=?`)
    .run(name, description, JSON.stringify(config), enabled ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.delete('/tools/:id', (req, res) => {
  db.prepare('DELETE FROM tools WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/tools/:id/toggle', (req, res) => {
  const tool = db.prepare('SELECT * FROM tools WHERE id=?').get(req.params.id);
  if (!tool) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE tools SET enabled=?, updated_at=datetime('now') WHERE id=?").run(tool.enabled ? 0 : 1, tool.id);
  res.json({ enabled: !tool.enabled });
});

router.post('/tools/:id/run', async (req, res) => {
  const tool = db.prepare('SELECT * FROM tools WHERE id=?').get(req.params.id);
  if (!tool) return res.status(404).json({ error: 'Not found' });
  try {
    const result = await executeTool(tool, req.body.args || {});
    res.json({ ok: true, result });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ─── WORKFLOWS ────────────────────────────────────────────────────────────────
router.get('/workflows', (req, res) => {
  const workflows = db.prepare('SELECT * FROM workflows ORDER BY name').all();
  res.json(workflows.map(w => ({ ...w, steps: JSON.parse(w.steps) })));
});

router.post('/workflows', (req, res) => {
  const { name, description, steps } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO workflows (id, name, description, steps) VALUES (?, ?, ?, ?)').run(
    id, name, description, JSON.stringify(steps || [])
  );
  res.json({ id });
});

router.put('/workflows/:id', (req, res) => {
  const { name, description, steps, enabled } = req.body;
  db.prepare(`UPDATE workflows SET name=?, description=?, steps=?, enabled=?, updated_at=datetime('now') WHERE id=?`)
    .run(name, description, JSON.stringify(steps), enabled ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.delete('/workflows/:id', (req, res) => {
  db.prepare('DELETE FROM workflows WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ─── CONVERSATIONS ─────────────────────────────────────────────────────────────
router.get('/conversations', (req, res) => {
  const convos = db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC").all();
  res.json(convos);
});

router.post('/conversations', (req, res) => {
  const id = uuidv4();
  const { title, mode } = req.body;
  db.prepare('INSERT INTO conversations (id, title, mode) VALUES (?, ?, ?)').run(id, title || 'New Chat', mode || 'agent');
  res.json({ id });
});

router.delete('/conversations/:id', (req, res) => {
  db.prepare('DELETE FROM conversations WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/conversations/:id/messages', (req, res) => {
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC').all(req.params.id);
  res.json(msgs.map(m => ({
    ...m,
    tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : null,
    tool_results: m.tool_results ? JSON.parse(m.tool_results) : null,
  })));
});

// ─── FILES ─────────────────────────────────────────────────────────────────────
router.get('/files', (req, res) => {
  const { dir } = req.query;
  const baseDir = dir === 'quarantine' ? QUARANTINE_DIR : WORKSPACE_DIR;
  try {
    const entries = fs.readdirSync(baseDir).map(name => {
      const fp = path.join(baseDir, name);
      const stat = fs.statSync(fp);
      return { name, path: fp, size: stat.size, modified: stat.mtime, is_dir: stat.isDirectory(), dir: dir || 'workspace' };
    });
    res.json(entries);
  } catch { res.json([]); }
});

router.get('/files/download', (req, res) => {
  const { file_path } = req.query;
  if (!file_path || (!file_path.startsWith(WORKSPACE_DIR) && !file_path.startsWith(QUARANTINE_DIR))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.download(file_path);
});

router.delete('/files', (req, res) => {
  const { file_path } = req.body;
  if (!file_path || (!file_path.startsWith(WORKSPACE_DIR) && !file_path.startsWith(QUARANTINE_DIR))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  fs.unlinkSync(file_path);
  res.json({ ok: true });
});

router.post('/files/move-to-workspace', (req, res) => {
  const { file_path } = req.body;
  if (!file_path || !file_path.startsWith(QUARANTINE_DIR)) {
    return res.status(403).json({ error: 'Not in quarantine' });
  }
  const dest = path.join(WORKSPACE_DIR, path.basename(file_path));
  fs.renameSync(file_path, dest);
  res.json({ ok: true, path: dest });
});

router.post('/files/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ ok: true, name: req.file.filename, path: req.file.path, size: req.file.size });
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

router.put('/settings', (req, res) => {
  const upsert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')");
  for (const [k, v] of Object.entries(req.body)) upsert.run(k, String(v));
  res.json({ ok: true });
});

// ─── MODELS (llama.cpp) ────────────────────────────────────────────────────────
router.get('/models', async (req, res) => {
  const setting = db.prepare("SELECT value FROM settings WHERE key='llamacpp_url'").get();
  const baseUrl = setting?.value || 'http://localhost:8080';
  try {
    const fetch = (await import('node-fetch')).default;
    const r = await fetch(`${baseUrl}/v1/models`, { timeout: 3000 });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.json({ error: 'Cannot reach llama.cpp', detail: e.message });
  }
});

module.exports = router;
