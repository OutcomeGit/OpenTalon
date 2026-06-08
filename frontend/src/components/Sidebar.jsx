import React from 'react';
import { MessageSquare, Wrench, GitFork, FolderOpen, Settings, Zap, Brain } from 'lucide-react';
import { useStore } from '../store';

const NAV = [
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'tools', icon: Wrench, label: 'Tools' },
  { id: 'workflows', icon: GitFork, label: 'Workflows' },
  { id: 'models', icon: Brain, label: 'Models' },
  { id: 'files', icon: FolderOpen, label: 'Files' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const { activePanel, setActivePanel, tools, isChatting } = useStore();
  const enabledCount = tools.filter(t => t.enabled).length;

  return (
    <aside className="w-14 flex flex-col items-center py-4 bg-surface-1 border-r border-border gap-1 shrink-0">
      <div className="mb-4 flex flex-col items-center">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <Zap size={16} className="text-black" fill="black" />
        </div>
      </div>

      {NAV.map(({ id, icon: Icon, label }) => {
        const active = activePanel === id;
        return (
          <button
            key={id}
            onClick={() => setActivePanel(id)}
            title={label}
            className={`
              w-10 h-10 rounded-lg flex items-center justify-center relative transition-all
              ${active ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text hover:bg-surface-3'}
            `}
          >
            <Icon size={18} />
            {id === 'tools' && enabledCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent rounded-full text-[9px] font-mono font-bold text-black flex items-center justify-center">
                {enabledCount}
              </span>
            )}
            {id === 'chat' && isChatting && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            )}
          </button>
        );
      })}
    </aside>
  );
}
