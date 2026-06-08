import React, { useEffect } from 'react';
import { useStore } from './store';
import { api } from './hooks/useApi';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import ToolsPanel from './components/ToolsPanel';
import WorkflowPanel from './components/WorkflowPanel';
import FilesPanel from './components/FilesPanel';
import SettingsPanel from './components/SettingsPanel';
import ModelsPanel from './components/ModelsPanel';

export default function App() {
  const { activePanel, setTools, setWorkflows, setConversations, setSettings } = useStore();

  useEffect(() => {
    api.getTools().then(setTools).catch(console.error);
    api.getWorkflows().then(setWorkflows).catch(console.error);
    api.getConversations().then(setConversations).catch(console.error);
    api.getSettings().then(setSettings).catch(console.error);
  }, []);

  const panels = { chat: ChatPanel, tools: ToolsPanel, workflows: WorkflowPanel, models: ModelsPanel, files: FilesPanel, settings: SettingsPanel };
  const Panel = panels[activePanel] || ChatPanel;

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Panel />
      </main>
    </div>
  );
}
