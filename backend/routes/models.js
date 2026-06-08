const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Writable } = require('stream');

const MODELS_DIR = process.env.MODELS_DIR || path.join(__dirname, '../../data/models');
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

// Active downloads: id -> { name, progress, size, downloaded, status, abortController }
const activeDownloads = new Map();

// ─── LIST LOCAL MODELS ────────────────────────────────────────────────────────
router.get('/local', (req, res) => {
  try {
    const files = fs.readdirSync(MODELS_DIR)
      .filter(f => f.endsWith('.gguf') || f.endsWith('.bin'))
      .map(name => {
        const fp = path.join(MODELS_DIR, name);
        const stat = fs.statSync(fp);
        return { name, path: fp, size: stat.size, modified: stat.mtime };
      });
    res.json(files);
  } catch { res.json([]); }
});

// ─── DELETE LOCAL MODEL ───────────────────────────────────────────────────────
router.delete('/local', (req, res) => {
  const { name } = req.body;
  const safe = path.resolve(MODELS_DIR, path.basename(name));
  if (!safe.startsWith(MODELS_DIR)) return res.status(403).json({ error: 'Access denied' });
  try { fs.unlinkSync(safe); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SEARCH HUGGINGFACE ───────────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const { q = '', limit = 20 } = req.query;
  try {
    const fetch = (await import('node-fetch')).default;
    // Search HF for GGUF models
    const query = q ? `${q} GGUF` : 'GGUF llama';
    const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&filter=gguf&limit=${limit}&full=false&config=false`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'OpenTalon/1.0' },
      timeout: 10000,
    });
    const models = await r.json();
    const results = (Array.isArray(models) ? models : []).map(m => ({
      id: m.modelId || m.id,
      author: m.author,
      name: m.modelId || m.id,
      downloads: m.downloads || 0,
      likes: m.likes || 0,
      lastModified: m.lastModified,
      tags: m.tags || [],
      url: `https://huggingface.co/${m.modelId || m.id}`,
    }));
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET MODEL FILES (quants) ─────────────────────────────────────────────────
router.get('/files', async (req, res) => {
  const { modelId } = req.query;
  if (!modelId) return res.status(400).json({ error: 'modelId required' });
  try {
    const fetch = (await import('node-fetch')).default;
    const url = `https://huggingface.co/api/models/${modelId}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'OpenTalon/1.0' } });
    const data = await r.json();
    const ggufFiles = (data.siblings || [])
      .filter(f => f.rfilename.endsWith('.gguf'))
      .map(f => ({
        filename: f.rfilename,
        size: f.size || null,
        downloadUrl: `https://huggingface.co/${modelId}/resolve/main/${f.rfilename}`,
        quant: detectQuant(f.rfilename),
      }))
      .sort((a, b) => quantOrder(a.quant) - quantOrder(b.quant));
    res.json({ modelId, files: ggufFiles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── START DOWNLOAD ───────────────────────────────────────────────────────────
router.post('/download', async (req, res) => {
  const { url, filename, modelId } = req.body;
  if (!url || !filename) return res.status(400).json({ error: 'url and filename required' });

  const safeName = path.basename(filename);
  const destPath = path.join(MODELS_DIR, safeName);
  const downloadId = `dl_${Date.now()}`;

  const entry = { id: downloadId, name: safeName, modelId, url, progress: 0, size: 0, downloaded: 0, status: 'downloading', startedAt: Date.now() };
  activeDownloads.set(downloadId, entry);

  res.json({ downloadId });

  // Start download in background
  (async () => {
    try {
      const fetch = (await import('node-fetch')).default;
      const controller = new AbortController();
      entry.abort = () => controller.abort();

      const r = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'OpenTalon/1.0' },
      });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const total = parseInt(r.headers.get('content-length') || '0');
      entry.size = total;

      let downloaded = 0;
      const dest = fs.createWriteStream(destPath);

      r.body.on('data', chunk => {
        downloaded += chunk.length;
        entry.downloaded = downloaded;
        entry.progress = total ? Math.round((downloaded / total) * 100) : 0;
      });

      await pipeline(r.body, dest);
      entry.status = 'done';
      entry.progress = 100;
    } catch (e) {
      entry.status = e.name === 'AbortError' ? 'cancelled' : 'error';
      entry.error = e.message;
      // Clean up partial file
      try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch {}
    }
  })();
});

// ─── DOWNLOAD PROGRESS ───────────────────────────────────────────────────────
router.get('/download/:id/progress', (req, res) => {
  const entry = activeDownloads.get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Download not found' });
  res.json(entry);
});

// ─── CANCEL DOWNLOAD ─────────────────────────────────────────────────────────
router.post('/download/:id/cancel', (req, res) => {
  const entry = activeDownloads.get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.abort) entry.abort();
  entry.status = 'cancelled';
  res.json({ ok: true });
});

// ─── ALL ACTIVE DOWNLOADS ─────────────────────────────────────────────────────
router.get('/downloads', (req, res) => {
  const list = Array.from(activeDownloads.values()).map(({ abort, ...rest }) => rest);
  res.json(list);
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function detectQuant(filename) {
  const f = filename.toUpperCase();
  const quants = ['Q2_K', 'Q3_K_S', 'Q3_K_M', 'Q3_K_L', 'Q4_0', 'Q4_K_S', 'Q4_K_M', 'Q5_0', 'Q5_K_S', 'Q5_K_M', 'Q6_K', 'Q8_0', 'F16', 'F32'];
  for (const q of quants) if (f.includes(q)) return q;
  return 'unknown';
}

function quantOrder(q) {
  const order = { 'Q4_K_M': 0, 'Q5_K_M': 1, 'Q4_K_S': 2, 'Q5_K_S': 3, 'Q3_K_M': 4, 'Q6_K': 5, 'Q8_0': 6, 'Q2_K': 7, 'Q4_0': 8, 'Q5_0': 9, 'F16': 10, 'F32': 11 };
  return order[q] ?? 99;
}

module.exports = router;
module.exports.MODELS_DIR = MODELS_DIR;
