import React, { useState } from 'react';
import { Wrench, Plus, ToggleLeft, ToggleRight, Trash2, Edit3, Play, ChevronDown, ChevronRight, Shield, Globe, Terminal, Code, Download, Search, FileText, Zap } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../hooks/useApi';

const TYPE_ICONS = {
  web_search: Search,
  web_scrape: Globe,
  file_read: FileText,
  file_write: FileText,
  file_list: FileText,
  shell: Terminal,
  http_request: Zap,
  code_run: Code,
  url_check: Shield,
  ytdlp: Download,
};

const TYPE_COLORS = {
  web_search: 'text-blue-400 bg-blue-400/10',
  web_scrape: 'text-purple-400 bg-purple-400/10',
  file_read: 'text-yellow-400 bg-yellow-400/10',
  file_write: 'text-yellow-400 bg-yellow-400/10',
  file_list: 'text-yellow-400 bg-yellow-400/10',
  shell: 'text-red-400 bg-red-400/10',
  http_request: 'text-cyan-400 bg-cyan-400/10',
  code_run: 'text-green-400 bg-green-400/10',
  url_check: 'text-emerald-400 bg-emerald-400/10',
  ytdlp: 'text-pink-400 bg-pink-400/10',
};

function ToolCard({ tool, onToggle, onEdit, onDelete, onRun }) {
  const [expanded, setExpanded] = useState(false);
  const [testArgs, setTestArgs] = useState('{}');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const Icon = TYPE_ICONS[tool.type] || Wrench;
  const colorClass = TYPE_COLORS[tool.type] || 'text-accent bg-accent/10';

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const args = JSON.parse(testArgs);
      const res = await api.runTool(tool.id, args);
      setTestResult(res);
    } catch (e) {
      setTestResult({ ok: false, error: e.message });
    }
    setTesting(false);
  }

  return (
    <div className={`border rounded-xl overflow-hidden transition-all tool-node ${tool.enabled ? 'border-border bg-surface-2' : 'border-border/50 bg-surface-1 opacity-60'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
            <Icon size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm font-display">{tool.name}</h3>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-3 text-muted uppercase tracking-wide">{tool.type}</span>
            </div>
            <p className="text-xs text-muted mt-0.5">{tool.description}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => setExpanded(e => !e)} className="p-1.5 rounded hover:bg-surface-3 text-muted hover:text-text transition-colors">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <button onClick={() => onEdit(tool)} className="p-1.5 rounded hover:bg-surface-3 text-muted hover:text-text transition-colors">
              <Edit3 size={14} />
            </button>
            <button onClick={() => onDelete(tool.id)} className="p-1.5 rounded hover:bg-red-400/10 text-muted hover:text-red-400 transition-colors">
              <Trash2 size={14} />
            </button>
            <button onClick={() => onToggle(tool.id)} className={`p-1.5 rounded transition-colors ${tool.enabled ? 'text-accent hover:text-claw-300' : 'text-muted hover:text-text'}`}>
              {tool.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3 bg-surface-1">
          {/* Config viewer */}
          <div>
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1.5">Config</div>
            <pre className="text-xs bg-surface-2 rounded-lg p-3 overflow-x-auto text-text-dim border border-border font-mono">
              {JSON.stringify(tool.config, null, 2)}
            </pre>
          </div>

          {/* Test runner */}
          <div>
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1.5">Test</div>
            <div className="flex gap-2">
              <textarea
                value={testArgs}
                onChange={e => setTestArgs(e.target.value)}
                rows={2}
                className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs font-mono text-text focus:outline-none focus:border-accent/50"
                placeholder='{"arg": "value"}'
              />
              <button
                onClick={runTest}
                disabled={testing}
                className="px-3 py-2 bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors self-start"
              >
                <Play size={11} /> Run
              </button>
            </div>
            {testResult && (
              <pre className={`mt-2 text-xs rounded-lg p-3 overflow-x-auto font-mono border ${testResult.ok ? 'bg-green-400/5 border-green-400/20 text-green-300' : 'bg-red-400/5 border-red-400/20 text-red-300'}`}>
                {JSON.stringify(testResult, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolEditor({ tool, onSave, onCancel }) {
  const [name, setName] = useState(tool?.name || '');
  const [desc, setDesc] = useState(tool?.description || '');
  const [type, setType] = useState(tool?.type || 'http_request');
  const [configStr, setConfigStr] = useState(JSON.stringify(tool?.config || {}, null, 2));
  const [error, setError] = useState('');

  async function save() {
    try {
      const config = JSON.parse(configStr);
      await onSave({ name, description: desc, type, config });
    } catch (e) {
      setError('Invalid JSON config: ' + e.message);
    }
  }

  const TOOL_TYPES = Object.keys(TYPE_ICONS);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-lg p-6 space-y-4 animate-slide-in">
        <h2 className="text-base font-semibold font-display">{tool ? 'Edit Tool' : 'New Tool'}</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted block mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50 text-text" />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50 text-text" />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50 text-text">
              {TOOL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              <option value="custom">custom</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Config (JSON)</label>
            <textarea value={configStr} onChange={e => setConfigStr(e.target.value)} rows={6}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-accent/50 text-text" />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-border text-muted hover:text-text hover:border-accent/30 transition-colors">Cancel</button>
          <button onClick={save} className="px-4 py-2 text-sm rounded-lg bg-accent text-black font-semibold hover:bg-claw-400 transition-colors">Save Tool</button>
        </div>
      </div>
    </div>
  );
}

export default function ToolsPanel() {
  const { tools, setTools } = useStore();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('all');

  async function handleToggle(id) {
    await api.toggleTool(id);
    const updated = await api.getTools();
    setTools(updated);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this tool?')) return;
    await api.deleteTool(id);
    setTools(tools.filter(t => t.id !== id));
  }

  async function handleSave(data) {
    if (editing?.id) {
      await api.updateTool(editing.id, { ...data, enabled: editing.enabled });
    } else {
      await api.createTool(data);
    }
    const updated = await api.getTools();
    setTools(updated);
    setEditing(null);
    setCreating(false);
  }

  const categories = ['all', ...new Set(tools.map(t => t.type))];
  const filtered = filter === 'all' ? tools : tools.filter(t => t.type === filter);
  const enabled = tools.filter(t => t.enabled).length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-surface-1 flex items-center gap-4 shrink-0">
        <div className="flex-1">
          <h1 className="text-base font-semibold font-display">Tools</h1>
          <p className="text-xs text-muted">{enabled}/{tools.length} enabled</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-3 py-2 bg-accent text-black text-xs font-semibold rounded-lg hover:bg-claw-400 transition-colors"
        >
          <Plus size={13} /> New Tool
        </button>
      </div>

      {/* Filter tabs */}
      <div className="px-6 py-2 border-b border-border bg-surface-1 flex gap-1 overflow-x-auto shrink-0">
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${filter === cat ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text hover:bg-surface-3'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Tool list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {filtered.map(tool => (
          <ToolCard
            key={tool.id}
            tool={tool}
            onToggle={handleToggle}
            onEdit={t => setEditing(t)}
            onDelete={handleDelete}
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted">No tools found</div>
        )}
      </div>

      {(creating || editing) && (
        <ToolEditor
          tool={editing}
          onSave={handleSave}
          onCancel={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
