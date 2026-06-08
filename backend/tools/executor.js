const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || path.join(__dirname, '../../data/workspace');
const QUARANTINE_DIR = process.env.QUARANTINE_DIR || path.join(__dirname, '../../data/quarantine');

[WORKSPACE_DIR, QUARANTINE_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

async function getProxyAgent(config) {
  if (!config.use_proxy) return null;
  const db = require('../db/database');
  const proxyEnabled = db.prepare("SELECT value FROM settings WHERE key='proxy_enabled'").get()?.value === 'true';
  if (!proxyEnabled) return null;
  const host = db.prepare("SELECT value FROM settings WHERE key='proxy_host'").get()?.value || '127.0.0.1';
  const port = db.prepare("SELECT value FROM settings WHERE key='proxy_port'").get()?.value || '9050';
  const { SocksProxyAgent } = require('socks-proxy-agent');
  return new SocksProxyAgent(`socks5://${host}:${port}`);
}

async function executeTool(tool, args) {
  const config = JSON.parse(tool.config);
  switch (tool.type) {
    case 'web_search': return await toolWebSearch(config, args);
    case 'web_scrape': return await toolWebScrape(config, args);
    case 'file_read': return toolFileRead(config, args);
    case 'file_write': return toolFileWrite(config, args);
    case 'file_list': return toolFileList(config, args);
    case 'shell': return await toolShell(config, args);
    case 'http_request': return await toolHttpRequest(config, args);
    case 'code_run': return await toolCodeRun(config, args);
    case 'url_check': return await toolUrlCheck(config, args);
    case 'ytdlp': return await toolYtDlp(config, args);
    default: throw new Error(`Unknown tool type: ${tool.type}`);
  }
}

async function toolWebSearch(config, { query, max_results }) {
  const n = max_results || config.max_results || 10;
  const agent = await getProxyAgent(config);
  const fetch = (await import('node-fetch')).default;
  const opts = agent ? { agent } : {};
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { ...opts, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  const results = [];
  $('.result__body').each((i, el) => {
    if (i >= n) return false;
    const title = $(el).find('.result__title').text().trim();
    const snippet = $(el).find('.result__snippet').text().trim();
    const href = $(el).find('.result__url').text().trim();
    if (title) results.push({ title, snippet, url: href });
  });
  return { results, query, count: results.length };
}

async function toolWebScrape(config, { url, selector }) {
  const agent = await getProxyAgent(config);
  const fetch = (await import('node-fetch')).default;
  const opts = agent ? { agent } : {};
  const res = await fetch(url, { ...opts, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    const html = await res.text();
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    $('script, style, nav, footer, iframe').remove();
    const text = selector ? $(selector).text() : $('body').text();
    const cleaned = text.replace(/\s+/g, ' ').trim();
    return { url, content: cleaned.slice(0, 8000), truncated: cleaned.length > 8000 };
  } else {
    // Binary download -> quarantine
    if (!config.quarantine_downloads) return { error: 'Binary downloads disabled' };
    const fname = path.basename(new URL(url).pathname) || 'download';
    const dest = path.join(QUARANTINE_DIR, `${Date.now()}-${fname}`);
    const buffer = await res.buffer();
    fs.writeFileSync(dest, buffer);
    return { url, downloaded: true, quarantined: true, path: dest, size: buffer.length };
  }
}

function toolFileRead(config, { file_path }) {
  const safe = path.resolve(WORKSPACE_DIR, path.basename(file_path));
  if (!safe.startsWith(WORKSPACE_DIR)) throw new Error('Path traversal blocked');
  if (!fs.existsSync(safe)) throw new Error(`File not found: ${file_path}`);
  const content = fs.readFileSync(safe, 'utf8');
  return { path: safe, content, size: content.length };
}

function toolFileWrite(config, { file_path, content }) {
  const safe = path.resolve(WORKSPACE_DIR, path.basename(file_path));
  if (!safe.startsWith(WORKSPACE_DIR)) throw new Error('Path traversal blocked');
  fs.writeFileSync(safe, content, 'utf8');
  return { path: safe, written: true, size: content.length };
}

function toolFileList(config, { directory }) {
  const base = directory === 'quarantine' ? QUARANTINE_DIR : WORKSPACE_DIR;
  const files = fs.readdirSync(base).map(name => {
    const fp = path.join(base, name);
    const stat = fs.statSync(fp);
    return { name, size: stat.size, modified: stat.mtime, is_dir: stat.isDirectory() };
  });
  return { directory: base, files };
}

async function toolShell(config, { command, timeout }) {
  const blocked = config.blocked_commands || ['rm -rf', 'mkfs', 'dd', 'format', 'shutdown', 'reboot'];
  for (const b of blocked) {
    if (command.toLowerCase().includes(b.toLowerCase())) {
      throw new Error(`Blocked command: ${b}`);
    }
  }
  return new Promise((resolve, reject) => {
    const t = (timeout || config.timeout || 30) * 1000;
    exec(command, { timeout: t, cwd: WORKSPACE_DIR }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(new Error(stderr || err.message));
      resolve({ command, stdout: stdout.slice(0, 10000), stderr: stderr.slice(0, 2000), exit_code: err?.code || 0 });
    });
  });
}

async function toolHttpRequest(config, { method, url, headers, body }) {
  const fetch = (await import('node-fetch')).default;
  const agent = await getProxyAgent(config);
  const opts = {
    method: (method || 'GET').toUpperCase(),
    headers: headers || {},
    ...(body ? { body: typeof body === 'object' ? JSON.stringify(body) : body } : {}),
    ...(agent ? { agent } : {}),
  };
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { url, method: opts.method, status: res.status, headers: Object.fromEntries(res.headers), body: data };
}

async function toolCodeRun(config, { code, language }) {
  const lang = language || config.language || 'javascript';
  if (lang !== 'javascript' && lang !== 'python3') {
    throw new Error(`Language ${lang} not supported`);
  }
  const tmpFile = path.join(WORKSPACE_DIR, `run_${Date.now()}.${lang === 'python3' ? 'py' : 'js'}`);
  fs.writeFileSync(tmpFile, code);
  try {
    const cmd = lang === 'python3' ? `python3 "${tmpFile}"` : `node "${tmpFile}"`;
    const result = await toolShell(config, { command: cmd, timeout: config.timeout || 30 });
    return { ...result, language: lang };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function toolUrlCheck(config, { url }) {
  const apiKey = config.vt_api_key;
  if (!apiKey) return { url, checked: false, reason: 'No VirusTotal API key configured', safe: null };
  try {
    const fetch = (await import('node-fetch')).default;
    const encoded = Buffer.from(url).toString('base64').replace(/=/g, '');
    const res = await fetch(`https://www.virustotal.com/api/v3/urls/${encoded}`, {
      headers: { 'x-apikey': apiKey }
    });
    const data = await res.json();
    const stats = data?.data?.attributes?.last_analysis_stats || {};
    const malicious = stats.malicious || 0;
    return { url, checked: true, malicious, suspicious: stats.suspicious || 0, safe: malicious === 0 };
  } catch (e) {
    return { url, checked: false, reason: e.message, safe: null };
  }
}

async function toolYtDlp(config, { url, format }) {
  const fmt = format || config.format || 'bestaudio';
  const outDir = config.quarantine ? QUARANTINE_DIR : WORKSPACE_DIR;
  const cmd = `yt-dlp -f "${fmt}" -o "${outDir}/%(title)s.%(ext)s" "${url}" --print after_move:filepath`;
  try {
    const result = await toolShell({ blocked_commands: [] }, { command: cmd, timeout: 120 });
    const outPath = result.stdout.trim().split('\n').pop();
    return { url, downloaded: true, path: outPath, quarantined: !!config.quarantine };
  } catch (e) {
    return { url, downloaded: false, error: e.message };
  }
}

module.exports = { executeTool, WORKSPACE_DIR, QUARANTINE_DIR };
