const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');

class LlamaManager extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.model = null;
    this.status = 'stopped';
    this.logs = [];
    this.startedAt = null;
    this.error = null;
    this.port = parseInt(process.env.LLAMA_PORT || '8080');
    this._readyTimer = null;
    this._pollTimer = null;
  }

  getState() {
    return {
      status: this.status,
      model: this.model,
      port: this.port,
      pid: this.process?.pid || null,
      startedAt: this.startedAt,
      error: this.error,
      logs: this.logs.slice(-100),
    };
  }

  _markReady() {
    if (this.status === 'running') return;
    clearTimeout(this._readyTimer);
    clearInterval(this._pollTimer);
    this.status = 'running';
    this.startedAt = Date.now();
    this._log('llama-server is ready');
    this.emit('state', this.getState());
    this.emit('ready');
  }

  // Poll the llama.cpp health endpoint to detect when it's actually ready
  _startPolling() {
    clearInterval(this._pollTimer);
    this._pollTimer = setInterval(async () => {
      if (this.status === 'running' || !this.process) {
        clearInterval(this._pollTimer);
        return;
      }
      try {
        const http = require('http');
        await new Promise((resolve, reject) => {
          const req = http.get(`http://localhost:${this.port}/health`, (res) => {
            if (res.statusCode === 200) resolve();
            else reject(new Error(`status ${res.statusCode}`));
          });
          req.on('error', reject);
          req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
        });
        this._markReady();
      } catch {}
    }, 3000);
  }

  async start(modelPath, options = {}) {
    if (this.process) await this.stop();

    const db = require('./db/database');
    const threads   = parseInt(options.threads    || db.prepare("SELECT value FROM settings WHERE key='llama_threads'").get()?.value    || '4');
    const gpuLayers = parseInt(options.gpu_layers || db.prepare("SELECT value FROM settings WHERE key='llama_gpu_layers'").get()?.value || '0');
    const ctxSize   = parseInt(options.ctx_size   || db.prepare("SELECT value FROM settings WHERE key='llama_ctx_size'").get()?.value   || '4096');
    const batchSize = parseInt(options.batch_size || db.prepare("SELECT value FROM settings WHERE key='llama_batch_size'").get()?.value || '512');
    this.port       = parseInt(options.port       || db.prepare("SELECT value FROM settings WHERE key='llama_port'").get()?.value       || '8080');

    const args = [
      '--model', modelPath,
      '--host', '0.0.0.0',
      '--port', String(this.port),
      '--threads', String(threads),
      '--ctx-size', String(ctxSize),
      '--batch-size', String(batchSize),
      '--n-gpu-layers', String(gpuLayers),
    ];

    this.model = path.basename(modelPath);
    this.status = 'starting';
    this.error = null;
    this.startedAt = null;
    this._log(`Starting llama-server: llama-server ${args.join(' ')}`);
    this.emit('state', this.getState());

    this.process = spawn('llama-server', args, {
      env: { ...process.env, LD_LIBRARY_PATH: '/usr/local/lib' },
    });

    // Catch any ready signal from stdout or stderr
    const onData = (data) => {
      const text = data.toString();
      this._log(text);
      const signals = [
        'HTTP server listening', 'server is listening', 'http server listening',
        'all slots are idle', 'srv  update_slots', 'main: server is listening',
        'llama server listening', 'starting the main loop',
      ];
      if (this.status !== 'running' && signals.some(s => text.toLowerCase().includes(s.toLowerCase()))) {
        this._markReady();
      }
    };

    this.process.stdout.on('data', onData);
    this.process.stderr.on('data', onData);

    this.process.on('exit', (code) => {
      clearTimeout(this._readyTimer);
      clearInterval(this._pollTimer);
      this._log(`llama-server exited with code ${code}`);
      this.process = null;
      this.status = code === 0 ? 'stopped' : 'error';
      if (code !== 0) this.error = `Exited with code ${code}`;
      this.startedAt = null;
      this.emit('state', this.getState());
    });

    this.process.on('error', (err) => {
      clearTimeout(this._readyTimer);
      clearInterval(this._pollTimer);
      this._log(`Failed to start: ${err.message}`);
      this.status = 'error';
      this.error = err.message;
      this.process = null;
      this.emit('state', this.getState());
    });

    // Start polling the health endpoint every 3 seconds
    // This is the most reliable way to know it's ready
    this._startPolling();

    // Save active model
    db.prepare("INSERT INTO settings (key, value) VALUES ('llama_active_model', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(modelPath);
  }

  async stop() {
    clearTimeout(this._readyTimer);
    clearInterval(this._pollTimer);
    if (!this.process) return;
    return new Promise((resolve) => {
      this.process.once('exit', resolve);
      this.process.kill('SIGTERM');
      setTimeout(() => { this.process?.kill('SIGKILL'); }, 5000);
    });
  }

  async restart(modelPath, options) {
    await this.stop();
    await this.start(modelPath, options);
  }

  _log(text) {
    const lines = text.trim().split('\n').filter(Boolean);
    const ts = new Date().toISOString();
    for (const line of lines) {
      const entry = { ts, text: line };
      this.logs.push(entry);
      this.emit('log', entry);
    }
    if (this.logs.length > 500) this.logs = this.logs.slice(-500);
  }
}

const manager = new LlamaManager();

// Auto-start last used model
setTimeout(async () => {
  try {
    const db = require('./db/database');
    const last = db.prepare("SELECT value FROM settings WHERE key='llama_active_model'").get()?.value;
    if (last) {
      const fs = require('fs');
      if (fs.existsSync(last)) {
        console.log(`Auto-starting llama.cpp with: ${last}`);
        await manager.start(last);
      } else {
        console.log(`Last model not found at ${last}, skipping auto-start`);
      }
    }
  } catch (e) {
    console.error('Auto-start failed:', e.message);
  }
}, 2000);

module.exports = manager;
