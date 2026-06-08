import React, { useState } from 'react';
import { Plus, Trash2, Edit3, Play, GitFork, ChevronRight, ArrowDown, GripVertical } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../hooks/useApi';

function StepNode({ step, index, tools, onRemove, onEdit, isLast }) {
  const tool = tools.find(t => t.id === step.toolId);
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-3 w-full max-w-sm">
        <div className="flex flex-col items-center gap-0.5 cursor-grab text-muted hover:text-text">
          <GripVertical size={14} />
        </div>
        <div className="flex-1 border border-border rounded-xl p-3 bg-surface-2 hover:border-accent/30 transition-colors">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{tool?.name || step.toolId || 'Unknown Tool'}</div>
                {step.description && <div className="text-[10px] text-muted truncate">{step.description}</div>}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => onEdit(index)} className="p-1 rounded hover:bg-surface-3 text-muted hover:text-text transition-colors">
                <Edit3 size={11} />
              </button>
              <button onClick={() => onRemove(index)} className="p-1 rounded hover:bg-red-400/10 text-muted hover:text-red-400 transition-colors">
                <Trash2 size={11} />
              </button>
            </div>
          </div>
          {step.args && Object.keys(step.args).length > 0 && (
            <div className="mt-2 text-[10px] font-mono text-muted bg-surface-3 rounded px-2 py-1 truncate">
              {JSON.stringify(step.args).slice(0, 60)}
            </div>
          )}
        </div>
      </div>
      {!isLast && (
        <div className="flex flex-col items-center my-1">
          <div className="w-px h-4 bg-border" />
          <ArrowDown size={12} className="text-muted" />
          <div className="w-px h-2 bg-border" />
        </div>
      )}
    </div>
  );
}

function WorkflowEditor({ workflow, tools, onSave, onCancel }) {
  const [name, setName] = useState(workflow?.name || '');
  const [desc, setDesc] = useState(workflow?.description || '');
  const [steps, setSteps] = useState(workflow?.steps || []);
  const [editingStep, setEditingStep] = useState(null);
  const [stepToolId, setStepToolId] = useState('');
  const [stepArgs, setStepArgs] = useState('{}');
  const [stepDesc, setStepDesc] = useState('');

  function addStep() {
    if (!stepToolId) return;
    let args = {};
    try { args = JSON.parse(stepArgs); } catch {}
    setSteps(s => [...s, { toolId: stepToolId, args, description: stepDesc }]);
    setStepToolId('');
    setStepArgs('{}');
    setStepDesc('');
  }

  function removeStep(idx) { setSteps(s => s.filter((_, i) => i !== idx)); }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-in">
        <div className="p-6 space-y-4">
          <h2 className="text-base font-semibold font-display">{workflow ? 'Edit Workflow' : 'New Workflow'}</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50" />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Description</label>
              <input value={desc} onChange={e => setDesc(e.target.value)} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50" />
            </div>
          </div>

          {/* Step builder */}
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-3">Steps</div>
            <div className="flex flex-col items-center">
              {steps.map((step, i) => (
                <StepNode key={i} step={step} index={i} tools={tools} onRemove={removeStep} onEdit={setEditingStep} isLast={i === steps.length - 1} />
              ))}
            </div>

            {/* Add step */}
            <div className="mt-3 border border-dashed border-border rounded-xl p-3 bg-surface-2/50">
              <div className="text-xs text-muted mb-2 font-medium">Add Step</div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select value={stepToolId} onChange={e => setStepToolId(e.target.value)}
                    className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-accent/50">
                    <option value="">Select tool…</option>
                    {tools.filter(t => t.enabled).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <input value={stepDesc} onChange={e => setStepDesc(e.target.value)} placeholder="Step description" className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-accent/50" />
                </div>
                <div className="flex gap-2">
                  <textarea value={stepArgs} onChange={e => setStepArgs(e.target.value)} rows={2} placeholder='Args (JSON): {"query": "{{input}}"}' className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs font-mono text-text focus:outline-none focus:border-accent/50" />
                  <button onClick={addStep} disabled={!stepToolId} className="px-3 py-2 bg-accent/15 border border-accent/30 text-accent rounded-lg text-xs font-semibold self-start flex items-center gap-1 disabled:opacity-40 transition-colors hover:bg-accent/25">
                    <Plus size={12} /> Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-border">
            <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-border text-muted hover:text-text transition-colors">Cancel</button>
            <button onClick={() => onSave({ name, description: desc, steps })} className="px-4 py-2 text-sm rounded-lg bg-accent text-black font-semibold hover:bg-claw-400 transition-colors">
              Save Workflow
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkflowPanel() {
  const { workflows, setWorkflows, tools } = useStore();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  async function handleSave(data) {
    if (editing?.id) {
      await api.updateWorkflow(editing.id, { ...data, enabled: editing.enabled ?? true });
    } else {
      await api.createWorkflow(data);
    }
    setWorkflows(await api.getWorkflows());
    setEditing(null);
    setCreating(false);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this workflow?')) return;
    await api.deleteWorkflow(id);
    setWorkflows(workflows.filter(w => w.id !== id));
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-border bg-surface-1 flex items-center gap-4 shrink-0">
        <div className="flex-1">
          <h1 className="text-base font-semibold font-display">Workflows</h1>
          <p className="text-xs text-muted">{workflows.length} workflow{workflows.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-3 py-2 bg-accent text-black text-xs font-semibold rounded-lg hover:bg-claw-400 transition-colors">
          <Plus size={13} /> New Workflow
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-3 flex items-center justify-center">
              <GitFork size={22} className="text-muted" />
            </div>
            <div>
              <p className="text-sm font-semibold">No workflows yet</p>
              <p className="text-xs text-muted mt-1">Chain tools together into reusable sequences</p>
            </div>
            <button onClick={() => setCreating(true)} className="mt-1 px-4 py-2 bg-accent text-black text-sm font-semibold rounded-lg hover:bg-claw-400 transition-colors">
              Create first workflow
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {workflows.map(w => (
              <div key={w.id} className="border border-border rounded-xl bg-surface-2 p-4 hover:border-accent/30 transition-all">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-sm font-semibold font-display">{w.name}</h3>
                    {w.description && <p className="text-xs text-muted mt-0.5">{w.description}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditing(w)} className="p-1.5 rounded hover:bg-surface-3 text-muted hover:text-text transition-colors">
                      <Edit3 size={13} />
                    </button>
                    <button onClick={() => handleDelete(w.id)} className="p-1.5 rounded hover:bg-red-400/10 text-muted hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {w.steps.map((step, i) => {
                    const tool = tools.find(t => t.id === step.toolId);
                    return (
                      <React.Fragment key={i}>
                        <span className="text-[10px] px-2 py-1 bg-surface-3 rounded-md text-text-dim font-mono">{tool?.name || 'Unknown'}</span>
                        {i < w.steps.length - 1 && <ChevronRight size={10} className="text-muted self-center" />}
                      </React.Fragment>
                    );
                  })}
                </div>
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-[10px] text-muted">{w.steps.length} step{w.steps.length !== 1 ? 's' : ''}</span>
                  <button className="flex items-center gap-1 text-[10px] text-accent hover:text-claw-300 font-semibold transition-colors">
                    <Play size={10} /> Run
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <WorkflowEditor
          workflow={editing}
          tools={tools}
          onSave={handleSave}
          onCancel={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
