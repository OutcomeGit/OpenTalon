const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'opentalon.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    config TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    steps TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    mode TEXT DEFAULT 'agent',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    tool_results TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    name TEXT NOT NULL,
    original_name TEXT,
    path TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    source TEXT DEFAULT 'upload',
    source_url TEXT,
    quarantined INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed default tools if none exist
const toolCount = db.prepare('SELECT COUNT(*) as c FROM tools').get();
if (toolCount.c === 0) {
  const insertTool = db.prepare(`
    INSERT INTO tools (id, name, description, type, config, enabled)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const { v4: uuidv4 } = require('uuid');

  const defaults = [
    {
      name: 'Web Search',
      description: 'Search the web using a search engine',
      type: 'web_search',
      config: JSON.stringify({ engine: 'duckduckgo', max_results: 10, use_proxy: false }),
    },
    {
      name: 'Web Scrape',
      description: 'Scrape a webpage for its text content',
      type: 'web_scrape',
      config: JSON.stringify({ js_enabled: false, quarantine_downloads: true, use_proxy: false }),
    },
    {
      name: 'File Read',
      description: 'Read contents of a file from the workspace',
      type: 'file_read',
      config: JSON.stringify({ allowed_dirs: ['workspace'] }),
    },
    {
      name: 'File Write',
      description: 'Write or create a file in the workspace',
      type: 'file_write',
      config: JSON.stringify({ allowed_dirs: ['workspace'] }),
    },
    {
      name: 'File List',
      description: 'List files in a directory',
      type: 'file_list',
      config: JSON.stringify({ allowed_dirs: ['workspace', 'quarantine'] }),
    },
    {
      name: 'Shell Execute',
      description: 'Run a shell command (use with caution)',
      type: 'shell',
      config: JSON.stringify({ timeout: 30, allowed_commands: [], blocked_commands: ['rm -rf', 'mkfs', 'dd'] }),
    },
    {
      name: 'HTTP Request',
      description: 'Make an HTTP API request',
      type: 'http_request',
      config: JSON.stringify({ allowed_methods: ['GET', 'POST', 'PUT', 'DELETE'], use_proxy: false }),
    },
    {
      name: 'Code Run',
      description: 'Execute generated code in a sandboxed environment',
      type: 'code_run',
      config: JSON.stringify({ language: 'javascript', timeout: 30 }),
    },
    {
      name: 'URL Safety Check',
      description: 'Check a URL against VirusTotal before visiting',
      type: 'url_check',
      config: JSON.stringify({ vt_api_key: '', block_on_unknown: false }),
    },
    {
      name: 'yt-dlp Download',
      description: 'Download video/audio from YouTube and other sites',
      type: 'ytdlp',
      config: JSON.stringify({ format: 'bestaudio', quarantine: true }),
    },
  ];

  for (const t of defaults) {
    insertTool.run(uuidv4(), t.name, t.description, t.type, t.config, 1);
  }
}

// Seed default settings
const upsertSetting = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO NOTHING
`);
const defaultSettings = [
  ['llamacpp_url', 'http://localhost:8080'],
  ['llamacpp_model', 'local-model'],
  ['openclaw_url', 'http://localhost:3000'],
  ['proxy_enabled', 'false'],
  ['proxy_type', 'tor'],
  ['proxy_host', '127.0.0.1'],
  ['proxy_port', '9050'],
  ['max_tokens', '4096'],
  ['temperature', '0.7'],
  ['system_prompt', 'You are a helpful assistant with access to tools. Use them when needed to complete the user\'s request.'],
  ['llama_threads', '4'],
  ['llama_gpu_layers', '0'],
  ['llama_ctx_size', '4096'],
  ['llama_batch_size', '512'],
  ['llama_port', '8080'],
];
for (const [k, v] of defaultSettings) upsertSetting.run(k, v);

module.exports = db;
