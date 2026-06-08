import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Download, Trash2, HardDrive, RefreshCw,
  ChevronDown, ChevronRight, ExternalLink, Brain,
  CheckCircle, AlertCircle, Loader, StopCircle, Play,
  Terminal, Zap, Circle, X, ArrowRight
} from 'lucide-react';
import { api } from '../hooks/useApi';
import { useStore } from '../store';

function formatBytes(bytes) {
  if (!bytes) return '?';
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(0)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

const QUANT_INFO = {
  'Q2_K':   { quality: 1, note: 'Tiny, lowest quality' },
  'Q3_K_S': { quality: 2, note: 'Very small' },
  'Q3_K_M': { quality: 3, note: 'Small' },
  'Q3_K_L': { quality: 3, note: 'Small, slightly better' },
  'Q4_0':   { quality: 3, note: 'Legacy 4-bit' },
  'Q4_K_S': { quality: 4, note: 'Good balance, smaller' },
  'Q4_K_M': { quality: 5, note: '★ Recommended' },
  'Q5_0':   { quality: 5, note: 'Legacy 5-bit' },
  'Q5_K_S': { quality: 6, note: 'High quality, small' },
  'Q5_K_M': { quality: 7, note: '★ High quality' },
  'Q6_K':   { quality: 8, note: 'Near-lossless' },
  'Q8_0':   { quality: 9, note: 'Highest quality, large' },
  'F16':    { quality: 10, note: 'Full precision, very large' },
  'F32':    { quality: 11, note: 'Full precision, huge' },
};

function QualityBar({ quant }) {
  const q = QUANT_INFO[quant];
  if (!q) return null;
  const pct = Math.round((q.quality / 11) * 100);
  const color = q.quality <= 3 ? 'bg-red-400' : q.quality <= 6 ? 'bg-yellow-400' : 'bg-green-400';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-surface-4 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted">{q.note}</span>
    </div>
  );
}

// ─── llama status bar ─────────────────────────────────────────────────────────
function LlamaStatusBar({ status, onStop, onShowLogs }) {
  const colors = {
    stopped:  'bg-surface-3 border-border text-muted',
    starting: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    running:  'bg-green-500/10 border-green-500/30 text-green-400',
    error:    'bg-red-500/10 border-red-500/30 text-red-400',
  };
  const dot = {
    stopped:  <Circle size={8} className="text-muted fill-muted shrink-0" />,
    starting: <Loader size={10} className="animate-spin text-yellow-400 shrink-0" />,
    running:  <Circle size={8} className="text-green-400 fill-green-400 animate-pulse shrink-0" />,
    error:    <Circle size={8} className="text-red-400 fill-red-400 shrink-0" />,
  };

  return (
    <div className={`mx-6 mt-4 mb-1 flex items-center gap-3 px-4 py-2.5 rounded-xl border ${colors[status.status] || colors.stopped}`}>
      {dot[status.status] || dot.stopped}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold">llama.cpp </span>
        <span className="text-xs opacity-70">{status.status}</span>
        {status.model && status.status === 'running' && (
          <span className="text-xs opacity-60"> · {status.model}</span>
        )}
        {status.error && <span className="text-xs text-red-400 ml-2">{status.error}</span>}
      </div>
      <button onClick={onShowLogs} className="text-[10px] opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
        <Terminal size={10} /> Logs
      </button>
      {(status.status === 'running' || status.status === 'starting') && (
        <button onClick={onStop} className="text-[10px] flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors shrink-0">
          <StopCircle size={10} /> Stop
        </button>
      )}
      {status.status === 'stopped' && (
        <span className="text-[10px] opacity-50 shrink-0">Go to Local tab to load a model</span>
      )}
    </div>
  );
}

// ─── Log viewer ───────────────────────────────────────────────────────────────
function LogViewer({ onClose }) {
  const [logs, setLogs] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    const es = new EventSource('/api/llama/logs');
    es.onmessage = (e) => {
      try { setLogs(prev => [...prev.slice(-300), JSON.parse(e.data)]); } catch {}
    };
    return () => es.close();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView(); }, [logs]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-3xl h-[70vh] flex flex-col animate-slide-in">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2"><Terminal size={14} className="text-accent" /><span className="text-sm font-semibold">llama.cpp Logs</span></div>
          <button onClick={onClose} className="text-muted hover:text-text text-lg">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs bg-surface-0 rounded-b-2xl">
          {logs.length === 0 ? <div className="text-muted">Waiting for logs…</div> : logs.map((l, i) => (
            <div key={i} className="flex gap-3 leading-5">
              <span className="text-muted shrink-0">{l.ts?.slice(11, 19)}</span>
              <span className="text-green-300 break-all">{l.text}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

// ─── Download complete toast ──────────────────────────────────────────────────
function DownloadCompleteToast({ name, onLoad, onDismiss }) {
  return (
    <div className="mx-6 mt-2 flex items-center gap-3 px-4 py-3 rounded-xl border border-green-500/30 bg-green-500/10 animate-slide-in">
      <CheckCircle size={14} className="text-green-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-green-300">Download complete</div>
        <div className="text-[10px] text-green-400/70 truncate">{name}</div>
      </div>
      <button onClick={onLoad}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-black text-xs font-bold rounded-lg hover:bg-claw-400 transition-colors shrink-0">
        <Zap size={11} /> Load Now
      </button>
      <button onClick={onDismiss} className="text-muted hover:text-text shrink-0"><X size={13} /></button>
    </div>
  );
}

// ─── Download progress card ───────────────────────────────────────────────────
function DownloadCard({ dl, onCancel }) {
  const isDone = dl.status === 'done';
  const isError = dl.status === 'error';
  const isCancelled = dl.status === 'cancelled';
  const isActive = dl.status === 'downloading';
  return (
    <div className={`border rounded-xl p-3 ${isDone ? 'border-green-500/30 bg-green-500/5' : isError || isCancelled ? 'border-red-400/20 bg-red-400/5' : 'border-border bg-surface-2'}`}>
      <div className="flex items-center gap-2 mb-2">
        {isDone ? <CheckCircle size={13} className="text-green-400 shrink-0" /> :
         isError ? <AlertCircle size={13} className="text-red-400 shrink-0" /> :
         isCancelled ? <X size={13} className="text-muted shrink-0" /> :
         <Loader size={13} className="text-accent animate-spin shrink-0" />}
        <span className="text-xs font-medium truncate flex-1">{dl.name}</span>
        {isActive && (
          <button onClick={() => onCancel(dl.id)} className="p-1 rounded hover:bg-red-400/10 text-muted hover:text-red-400 transition-colors">
            <StopCircle size={12} />
          </button>
        )}
      </div>
      {isActive && (
        <div className="space-y-1">
          <div className="h-1.5 bg-surface-4 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${dl.progress}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted font-mono">
            <span>{dl.progress}%</span>
            <span>{formatBytes(dl.downloaded)} / {formatBytes(dl.size)}</span>
          </div>
        </div>
      )}
      {isError && <p className="text-[10px] text-red-400 mt-1">{dl.error}</p>}
      {isDone && <p className="text-[10px] text-green-400 mt-1">Go to Local tab to load</p>}
    </div>
  );
}

// ─── Model file row ───────────────────────────────────────────────────────────
function ModelFileRow({ file, onDownload, localNames, downloading }) {
  const isLocal = localNames.has(file.filename);
  const isDownloading = downloading.has(file.filename);
  const isRecommended = file.quant === 'Q4_K_M' || file.quant === 'Q5_K_M';
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${isRecommended ? 'border-accent/20 bg-accent/5' : 'border-transparent hover:bg-surface-3'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono font-semibold ${isRecommended ? 'text-accent' : 'text-text'}`}>{file.quant}</span>
          {isRecommended && <span className="text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-semibold">REC</span>}
        </div>
        <QualityBar quant={file.quant} />
        <div className="text-[10px] text-muted mt-0.5 truncate font-mono">{file.filename}</div>
      </div>
      <div className="text-xs text-muted font-mono shrink-0 w-16 text-right">{formatBytes(file.size)}</div>
      <div className="shrink-0">
        {isLocal ? (
          <span className="flex items-center gap-1 text-[10px] text-green-400 font-semibold px-2 py-1 bg-green-400/10 rounded-lg">
            <CheckCircle size={10} /> Local
          </span>
        ) : isDownloading ? (
          <span className="flex items-center gap-1 text-[10px] text-accent px-2 py-1">
            <Loader size={10} className="animate-spin" /> DL…
          </span>
        ) : (
          <button onClick={() => onDownload(file)}
            className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent rounded-lg font-semibold transition-colors">
            <Download size={11} /> Download
          </button>
        )}
      </div>
    </div>
  );
}

// ─── HuggingFace result card ──────────────────────────────────────────────────
function SearchResultCard({ model, expanded, onExpand, onDownload, localNames, downloading }) {
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);

  async function expand() {
    onExpand(model.id);
    if (!files) {
      setLoading(true);
      try { setFiles((await api.getModelFiles(model.id)).files || []); }
      catch { setFiles([]); }
      setLoading(false);
    }
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-surface-2 hover:border-accent/20 transition-all">
      <button className="w-full flex items-start gap-3 p-4 text-left" onClick={expand}>
        <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center shrink-0">
          <Brain size={15} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold font-display truncate block">{model.name}</span>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted">
            <span>↓ {(model.downloads || 0).toLocaleString()}</span>
            <span>♥ {model.likes || 0}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {(model.tags || []).slice(0, 4).map(t => (
              <span key={t} className="text-[9px] px-1.5 py-0.5 bg-surface-3 rounded text-muted">{t}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href={model.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="p-1.5 rounded hover:bg-surface-3 text-muted hover:text-text transition-colors">
            <ExternalLink size={13} />
          </a>
          {expanded ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 bg-surface-1">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted py-3"><Loader size={12} className="animate-spin" /> Loading…</div>
          ) : !files?.length ? (
            <div className="text-xs text-muted py-3">No GGUF files found.</div>
          ) : (
            <div className="space-y-1">
              <div className="text-[10px] text-muted uppercase tracking-wider mb-2 font-semibold">Available Quantizations</div>
              {files.map(f => (
                <ModelFileRow key={f.filename} file={f} onDownload={onDownload} localNames={localNames} downloading={downloading} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function ModelsPanel() {
  const { setActivePanel } = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [localModels, setLocalModels] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [downloadingFiles, setDownloadingFiles] = useState(new Set());
  const [tab, setTab] = useState('search');
  const [llamaStatus, setLlamaStatus] = useState({ status: 'stopped' });
  const [showLogs, setShowLogs] = useState(false);
  const [justDownloaded, setJustDownloaded] = useState(null);
  const pollRef = useRef(null);
  const prevDownloads = useRef([]);

  const localNames = new Set(localModels.map(m => m.name));

  async function refresh() {
    try {
      const [models, dls, status] = await Promise.all([
        api.getLocalModels(),
        api.getActiveDownloads(),
        api.getLlamaStatus(),
      ]);
      setLocalModels(models);
      setDownloads(dls);
      setLlamaStatus(status);
      setDownloadingFiles(new Set(dls.filter(d => d.status === 'downloading').map(d => d.name)));

      // Detect newly completed downloads
      const prev = prevDownloads.current;
      const newlyDone = dls.find(d => d.status === 'done' && !prev.find(p => p.id === d.id && p.status === 'done'));
      if (newlyDone) setJustDownloaded(newlyDone);
      prevDownloads.current = dls;
    } catch {}
  }

  useEffect(() => {
    refresh();
    doSearch('');
    pollRef.current = setInterval(refresh, 2000);
    return () => clearInterval(pollRef.current);
  }, []);

  async function doSearch(q) {
    setSearching(true);
    try { setResults(await api.searchHuggingFace(q)); }
    catch { setResults([]); }
    setSearching(false);
  }

  async function handleDownload(modelId, file) {
    setDownloadingFiles(s => new Set([...s, file.filename]));
    await api.startDownload(file.downloadUrl, file.filename, modelId);
    setTab('downloads');
    refresh();
  }

  async function handleLoad(model) {
    await api.startLlama(`/data/models/${model.name}`);
    setLlamaStatus({ status: 'starting', model: model.name });
  }

  async function handleStop() {
    await api.stopLlama();
    refresh();
  }

  const activeCount = downloads.filter(d => d.status === 'downloading').length;
  const isLoaded = llamaStatus.status === 'running';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-surface-1 flex items-center gap-4 shrink-0">
        <div className="flex-1">
          <h1 className="text-base font-semibold font-display">Models</h1>
          <p className="text-xs text-muted">{localModels.length} local · {formatBytes(localModels.reduce((a, m) => a + m.size, 0))} used</p>
        </div>
        <button onClick={refresh} className="p-2 rounded-lg hover:bg-surface-3 text-muted hover:text-text transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* llama status */}
      <LlamaStatusBar status={llamaStatus} onStop={handleStop} onShowLogs={() => setShowLogs(true)} />

      {/* Download complete toast */}
      {justDownloaded && (
        <DownloadCompleteToast
          name={justDownloaded.name}
          onLoad={() => {
            handleLoad({ name: justDownloaded.name });
            setJustDownloaded(null);
            setTab('local');
          }}
          onDismiss={() => setJustDownloaded(null)}
        />
      )}

      {/* Tabs */}
      <div className="px-6 py-2 border-b border-border bg-surface-1 flex gap-1 shrink-0">
        <button onClick={() => setTab('search')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${tab === 'search' ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text hover:bg-surface-3'}`}>
          <Search size={11} /> Search HuggingFace
        </button>
        <button onClick={() => setTab('local')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${tab === 'local' ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text hover:bg-surface-3'}`}>
          <HardDrive size={11} /> Local
          <span className={`font-mono ${localModels.length > 0 ? 'text-accent' : ''}`}>{localModels.length}</span>
        </button>
        <button onClick={() => setTab('downloads')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${tab === 'downloads' ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text hover:bg-surface-3'}`}>
          <Download size={11} /> Downloads
          {activeCount > 0 && <span className="w-4 h-4 rounded-full bg-accent text-black text-[9px] font-bold flex items-center justify-center">{activeCount}</span>}
        </button>
      </div>

      {/* Search tab */}
      {tab === 'search' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-3 border-b border-border shrink-0">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input value={query} onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSearch(query)}
                  placeholder="Search HuggingFace for GGUF models… (Enter)"
                  className="w-full bg-surface-2 border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/50" />
              </div>
              <button onClick={() => doSearch(query)} disabled={searching}
                className="px-4 py-2 bg-accent text-black text-xs font-semibold rounded-lg hover:bg-claw-400 disabled:opacity-50 flex items-center gap-2">
                {searching ? <Loader size={12} className="animate-spin" /> : <Search size={12} />} Search
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {searching ? (
              <div className="flex items-center justify-center h-32 gap-2 text-muted text-sm">
                <Loader size={16} className="animate-spin" /> Searching…
              </div>
            ) : results.map(m => (
              <SearchResultCard key={m.id} model={m}
                expanded={expandedId === m.id}
                onExpand={id => setExpandedId(expandedId === id ? null : id)}
                onDownload={(file) => handleDownload(m.id, file)}
                localNames={localNames} downloading={downloadingFiles} />
            ))}
          </div>
        </div>
      )}

      {/* Local models tab */}
      {tab === 'local' && (
        <div className="flex-1 overflow-y-auto p-6">
          {localModels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <HardDrive size={28} className="text-muted" />
              <div>
                <p className="text-sm font-semibold">No models downloaded yet</p>
                <p className="text-xs text-muted mt-1">Search HuggingFace and download a GGUF model</p>
              </div>
              <button onClick={() => setTab('search')}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-black text-xs font-bold rounded-lg hover:bg-claw-400 transition-colors">
                <Search size={12} /> Search Models <ArrowRight size={12} />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {!isLoaded && (
                <div className="flex items-center gap-2 px-4 py-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-xs text-yellow-300">
                  <AlertCircle size={13} className="shrink-0" />
                  No model loaded — click <strong className="mx-1">Load</strong> on a model below to start llama.cpp
                </div>
              )}
              {localModels.map(m => {
                const isRunning = llamaStatus.model === m.name && llamaStatus.status === 'running';
                const isStarting = llamaStatus.model === m.name && llamaStatus.status === 'starting';
                return (
                  <div key={m.path} className={`flex items-center gap-3 px-4 py-3.5 border rounded-xl transition-all group ${isRunning ? 'border-green-500/40 bg-green-500/5' : 'border-border bg-surface-2 hover:border-accent/30'}`}>
                    <Brain size={16} className={isRunning ? 'text-green-400 shrink-0' : 'text-accent shrink-0'} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{m.name}</div>
                      <div className="text-[10px] text-muted mt-0.5">{formatBytes(m.size)} · {new Date(m.modified).toLocaleDateString()}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isRunning ? (
                        <span className="flex items-center gap-1.5 text-xs text-green-400 font-bold px-3 py-1.5 bg-green-400/10 rounded-lg border border-green-400/20">
                          <Zap size={11} /> Running
                        </span>
                      ) : isStarting ? (
                        <span className="flex items-center gap-1.5 text-xs text-yellow-400 px-3 py-1.5">
                          <Loader size={11} className="animate-spin" /> Starting…
                        </span>
                      ) : (
                        <button onClick={() => handleLoad(m)}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent hover:bg-claw-400 text-black rounded-lg font-bold transition-colors">
                          <Play size={11} /> Load
                        </button>
                      )}
                      <button onClick={async () => { if (!confirm(`Delete ${m.name}?`)) return; await api.deleteLocalModel(m.name); refresh(); }}
                        className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-400/10 text-muted hover:text-red-400 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Downloads tab */}
      {tab === 'downloads' && (
        <div className="flex-1 overflow-y-auto p-6">
          {downloads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted text-sm">
              <Download size={24} /><span>No downloads yet</span>
            </div>
          ) : (
            <div className="space-y-2">
              {[...downloads].reverse().map(dl => (
                <DownloadCard key={dl.id} dl={dl} onCancel={(id) => { api.cancelDownload(id); refresh(); }} />
              ))}
            </div>
          )}
        </div>
      )}

      {showLogs && <LogViewer onClose={() => setShowLogs(false)} />}
    </div>
  );
}
