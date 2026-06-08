const BASE = '/api';

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  // Tools
  getTools: () => apiFetch('/tools'),
  createTool: (data) => apiFetch('/tools', { method: 'POST', body: JSON.stringify(data) }),
  updateTool: (id, data) => apiFetch(`/tools/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTool: (id) => apiFetch(`/tools/${id}`, { method: 'DELETE' }),
  toggleTool: (id) => apiFetch(`/tools/${id}/toggle`, { method: 'POST' }),
  runTool: (id, args) => apiFetch(`/tools/${id}/run`, { method: 'POST', body: JSON.stringify({ args }) }),

  // Workflows
  getWorkflows: () => apiFetch('/workflows'),
  createWorkflow: (data) => apiFetch('/workflows', { method: 'POST', body: JSON.stringify(data) }),
  updateWorkflow: (id, data) => apiFetch(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWorkflow: (id) => apiFetch(`/workflows/${id}`, { method: 'DELETE' }),

  // Conversations
  getConversations: () => apiFetch('/conversations'),
  createConversation: (data) => apiFetch('/conversations', { method: 'POST', body: JSON.stringify(data) }),
  deleteConversation: (id) => apiFetch(`/conversations/${id}`, { method: 'DELETE' }),
  getMessages: (id) => apiFetch(`/conversations/${id}/messages`),

  // Files
  getFiles: (dir = 'workspace') => apiFetch(`/files?dir=${dir}`),
  deleteFile: (file_path) => apiFetch('/files', { method: 'DELETE', body: JSON.stringify({ file_path }) }),
  moveToWorkspace: (file_path) => apiFetch('/files/move-to-workspace', { method: 'POST', body: JSON.stringify({ file_path }) }),
  downloadFile: (file_path) => `/api/files/download?file_path=${encodeURIComponent(file_path)}`,

  // Settings
  getSettings: () => apiFetch('/settings'),
  updateSettings: (data) => apiFetch('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Models
  getModels: () => apiFetch('/models'),
  getLocalModels: () => apiFetch('/models/local'),

  // llama.cpp control
  getLlamaStatus: () => apiFetch('/llama/status'),
  startLlama: (model_path, opts = {}) => apiFetch('/llama/start', { method: 'POST', body: JSON.stringify({ model_path, ...opts }) }),
  stopLlama: () => apiFetch('/llama/stop', { method: 'POST' }),
  restartLlama: (model_path) => apiFetch('/llama/restart', { method: 'POST', body: JSON.stringify({ model_path }) }),
  deleteLocalModel: (name) => apiFetch('/models/local', { method: 'DELETE', body: JSON.stringify({ name }) }),
  searchHuggingFace: (q) => apiFetch(`/models/search?q=${encodeURIComponent(q)}&limit=20`),
  getModelFiles: (modelId) => apiFetch(`/models/files?modelId=${encodeURIComponent(modelId)}`),
  startDownload: (url, filename, modelId) => apiFetch('/models/download', { method: 'POST', body: JSON.stringify({ url, filename, modelId }) }),
  getDownloadProgress: (id) => apiFetch(`/models/download/${id}/progress`),
  cancelDownload: (id) => apiFetch(`/models/download/${id}/cancel`, { method: 'POST' }),
  getActiveDownloads: () => apiFetch('/models/downloads'),
};

export class ChatSocket {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.ws = null;
  }
  connect() {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname;
    const port = import.meta.env.DEV ? '8765' : window.location.port;
    this.ws = new WebSocket(`${proto}://${host}:${port}/ws/chat`);
    this.ws.onmessage = (e) => {
      try { this.onMessage(JSON.parse(e.data)); } catch {}
    };
    this.ws.onerror = () => this.onMessage({ type: 'error', text: 'WebSocket error' });
    return new Promise(r => { this.ws.onopen = r; });
  }
  send(data) { this.ws?.send(JSON.stringify(data)); }
  close() { this.ws?.close(); }
}
