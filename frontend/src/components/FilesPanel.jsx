import React, { useState, useEffect, useRef } from 'react';
import { FolderOpen, Shield, Trash2, Download, MoveRight, Upload, RefreshCw, File, FileText, Image, Film, Music, Archive, Eye } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../hooks/useApi';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getFileIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return Image;
  if (['mp4','mov','avi','webm','mkv'].includes(ext)) return Film;
  if (['mp3','wav','ogg','flac','m4a'].includes(ext)) return Music;
  if (['zip','tar','gz','rar','7z'].includes(ext)) return Archive;
  if (['txt','md','json','csv','log','js','py','sh','yml','yaml','toml'].includes(ext)) return FileText;
  return File;
}

function FileRow({ file, onDelete, onDownload, onMoveToWorkspace, onPreview, quarantine }) {
  const Icon = getFileIcon(file.name);
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors border-b border-border/50 last:border-0 group ${quarantine ? 'border-l-2 border-l-yellow-500/30' : ''}`}>
      <Icon size={14} className={`shrink-0 ${quarantine ? 'text-yellow-400' : 'text-muted'}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{file.name}</div>
        <div className="text-[10px] text-muted">{formatBytes(file.size)} · {new Date(file.modified).toLocaleDateString()}</div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onPreview(file)} title="Preview" className="p-1.5 rounded hover:bg-surface-3 text-muted hover:text-text transition-colors">
          <Eye size={13} />
        </button>
        <a href={onDownload(file)} download={file.name} className="p-1.5 rounded hover:bg-surface-3 text-muted hover:text-text transition-colors">
          <Download size={13} />
        </a>
        {quarantine && (
          <button onClick={() => onMoveToWorkspace(file)} title="Move to Workspace" className="p-1.5 rounded hover:bg-green-400/10 text-muted hover:text-green-400 transition-colors">
            <MoveRight size={13} />
          </button>
        )}
        <button onClick={() => onDelete(file)} title="Delete" className="p-1.5 rounded hover:bg-red-400/10 text-muted hover:text-red-400 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function PreviewModal({ file, onClose }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const ext = file?.name.split('.').pop()?.toLowerCase();
  const isText = ['txt','md','json','csv','log','js','py','sh','yml','yaml','toml','html','css'].includes(ext);
  const isImage = ['jpg','jpeg','png','gif','webp','svg'].includes(ext);

  useEffect(() => {
    if (!file) return;
    if (isText) {
      fetch(api.downloadFile(file.path))
        .then(r => r.text())
        .then(t => { setContent(t); setLoading(false); })
        .catch(() => setLoading(false));
    } else { setLoading(false); }
  }, [file]);

  if (!file) return null;
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden animate-slide-in flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium truncate">{file.name}</span>
          <button onClick={onClose} className="text-muted hover:text-text text-lg leading-none">×</button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted text-sm">Loading…</div>
          ) : isImage ? (
            <img src={api.downloadFile(file.path)} alt={file.name} className="max-w-full h-auto rounded-lg" />
          ) : isText && content ? (
            <pre className="text-xs font-mono text-text whitespace-pre-wrap">{content}</pre>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 gap-3 text-muted">
              <p className="text-sm">Preview not available for this file type</p>
              <a href={api.downloadFile(file.path)} download={file.name} className="text-accent text-sm hover:underline">Download instead</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FilesPanel() {
  const { workspaceFiles, quarantineFiles, setWorkspaceFiles, setQuarantineFiles } = useStore();
  const [tab, setTab] = useState('workspace');
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  async function refresh() {
    const [ws, q] = await Promise.all([api.getFiles('workspace'), api.getFiles('quarantine')]);
    setWorkspaceFiles(ws);
    setQuarantineFiles(q);
  }

  useEffect(() => { refresh(); }, []);

  async function handleDelete(file) {
    if (!confirm(`Delete ${file.name}?`)) return;
    await api.deleteFile(file.path);
    refresh();
  }

  async function handleMoveToWorkspace(file) {
    await api.moveToWorkspace(file.path);
    refresh();
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    await fetch('/api/files/upload', { method: 'POST', body: fd });
    await refresh();
    setUploading(false);
  }

  const files = tab === 'workspace' ? workspaceFiles : quarantineFiles;
  const quarantineCount = quarantineFiles.length;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-border bg-surface-1 flex items-center gap-4 shrink-0">
        <div className="flex-1">
          <h1 className="text-base font-semibold font-display">Files</h1>
          <p className="text-xs text-muted">{files.length} file{files.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={refresh} className="p-2 rounded-lg hover:bg-surface-3 text-muted hover:text-text transition-colors">
          <RefreshCw size={14} />
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="flex items-center gap-2 px-3 py-2 bg-accent text-black text-xs font-semibold rounded-lg hover:bg-claw-400 transition-colors disabled:opacity-50">
          <Upload size={13} /> Upload
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
      </div>

      {/* Tabs */}
      <div className="px-6 py-2 border-b border-border bg-surface-1 flex gap-1 shrink-0">
        <button onClick={() => setTab('workspace')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'workspace' ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text hover:bg-surface-3'}`}>
          <FolderOpen size={12} /> Workspace <span className="font-mono">{workspaceFiles.length}</span>
        </button>
        <button onClick={() => setTab('quarantine')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'quarantine' ? 'bg-yellow-400/15 text-yellow-400' : 'text-muted hover:text-text hover:bg-surface-3'}`}>
          <Shield size={12} /> Quarantine
          {quarantineCount > 0 && <span className="font-mono text-yellow-400">{quarantineCount}</span>}
        </button>
      </div>

      {/* Description */}
      {tab === 'quarantine' && (
        <div className="px-6 py-2 bg-yellow-400/5 border-b border-yellow-400/10 text-xs text-yellow-300/70 shrink-0">
          Files downloaded from the web land here. Review before moving to your workspace.
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto bg-surface-1">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted text-sm">
            {tab === 'workspace' ? <FolderOpen size={24} /> : <Shield size={24} />}
            <span>{tab === 'workspace' ? 'Workspace is empty' : 'Quarantine is empty'}</span>
          </div>
        ) : (
          files.map(f => (
            <FileRow
              key={f.path}
              file={f}
              quarantine={tab === 'quarantine'}
              onDelete={handleDelete}
              onDownload={(f) => api.downloadFile(f.path)}
              onMoveToWorkspace={handleMoveToWorkspace}
              onPreview={setPreview}
            />
          ))
        )}
      </div>

      {preview && <PreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
