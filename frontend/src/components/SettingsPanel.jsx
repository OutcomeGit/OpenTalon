import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Server, Brain, Shield, Wifi } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../hooks/useApi';

function Section({ icon: Icon, title, children }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-surface-2 border-b border-border flex items-center gap-2">
        <Icon size={14} className="text-accent" />
        <h2 className="text-sm font-semibold font-display">{title}</h2>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-text block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

export default function SettingsPanel() {
  const { settings, setSettings } = useStore();
  const [local, setLocal] = useState({});
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState([]);

  useEffect(() => { setLocal(settings); }, [settings]);

  useEffect(() => {
    api.getModels().then(d => {
      if (d?.data) setModels(d.data);
    }).catch(() => {});
  }, []);

  function set(key, value) { setLocal(s => ({ ...s, [key]: value })); }

  async function save() {
    await api.updateSettings(local);
    setSettings(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const inp = "w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50 transition-colors";

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-border bg-surface-1 flex items-center gap-4 shrink-0">
        <div className="flex-1">
          <h1 className="text-base font-semibold font-display">Settings</h1>
          <p className="text-xs text-muted">Backend, model, privacy configuration</p>
        </div>
        <button onClick={save} className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${saved ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-accent text-black hover:bg-claw-400'}`}>
          <Save size={13} /> {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <Section icon={Server} title="llama.cpp Connection">
          <Field label="llama.cpp Base URL" hint="Usually http://localhost:8080 — the OpenAI-compatible server endpoint">
            <input value={local.llamacpp_url || ''} onChange={e => set('llamacpp_url', e.target.value)} className={inp} />
          </Field>
          <Field label="Model Name" hint="Must match what llama.cpp reports — or leave as 'local-model'">
            <div className="flex gap-2">
              <input value={local.llamacpp_model || ''} onChange={e => set('llamacpp_model', e.target.value)} className={inp} />
              {models.length > 0 && (
                <select onChange={e => set('llamacpp_model', e.target.value)} className="bg-surface-2 border border-border rounded-lg px-2 text-xs text-muted">
                  <option value="">Detected models</option>
                  {models.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
                </select>
              )}
            </div>
          </Field>
          <Field label="OpenClaw URL" hint="OpenClaw gateway URL (if using OpenClaw alongside llama.cpp)">
            <input value={local.openclaw_url || ''} onChange={e => set('openclaw_url', e.target.value)} className={inp} />
          </Field>
        </Section>

        <Section icon={Brain} title="Inference Parameters">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max Tokens">
              <input type="number" value={local.max_tokens || 4096} onChange={e => set('max_tokens', e.target.value)} className={inp} />
            </Field>
            <Field label="Temperature">
              <div className="flex items-center gap-2">
                <input type="range" min="0" max="2" step="0.05" value={local.temperature || 0.7} onChange={e => set('temperature', e.target.value)} className="flex-1 accent-orange-500" />
                <span className="text-xs font-mono text-accent w-8">{parseFloat(local.temperature || 0.7).toFixed(2)}</span>
              </div>
            </Field>
          </div>
          <Field label="System Prompt">
            <textarea rows={4} value={local.system_prompt || ''} onChange={e => set('system_prompt', e.target.value)} className={inp + ' resize-none'} />
          </Field>
        </Section>

        <Section icon={Shield} title="Privacy & Proxy">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Enable Proxy (Tor / I2P)</div>
              <div className="text-xs text-muted">Route web requests through an anonymizing proxy</div>
            </div>
            <button
              onClick={() => set('proxy_enabled', local.proxy_enabled === 'true' ? 'false' : 'true')}
              className={`relative w-10 h-5 rounded-full transition-colors ${local.proxy_enabled === 'true' ? 'bg-accent' : 'bg-surface-4'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${local.proxy_enabled === 'true' ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {local.proxy_enabled === 'true' && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Proxy Type">
                  <select value={local.proxy_type || 'tor'} onChange={e => set('proxy_type', e.target.value)} className={inp}>
                    <option value="tor">Tor (SOCKS5, port 9050)</option>
                    <option value="i2p">I2P (SOCKS5, port 4444)</option>
                    <option value="custom">Custom SOCKS5</option>
                  </select>
                </Field>
                <Field label="Proxy Host">
                  <input value={local.proxy_host || '127.0.0.1'} onChange={e => set('proxy_host', e.target.value)} className={inp} />
                </Field>
              </div>
              <Field label="Proxy Port">
                <input type="number" value={local.proxy_port || '9050'} onChange={e => set('proxy_port', e.target.value)} className={inp} />
              </Field>
            </div>
          )}

          <Field label="VirusTotal API Key" hint="Optional — used by the URL Safety Check tool to pre-screen links before the AI visits them">
            <input
              type="password"
              value={local.vt_api_key || ''}
              onChange={e => set('vt_api_key', e.target.value)}
              placeholder="Leave blank to skip URL screening"
              className={inp}
            />
          </Field>
        </Section>
      </div>
    </div>
  );
}
