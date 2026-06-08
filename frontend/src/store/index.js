import { create } from 'zustand';

export const useStore = create((set, get) => ({
  // Tools
  tools: [],
  setTools: (tools) => set({ tools }),
  toggleTool: (id) => set(s => ({ tools: s.tools.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t) })),

  // Workflows
  workflows: [],
  setWorkflows: (workflows) => set({ workflows }),

  // Conversations
  conversations: [],
  activeConversationId: null,
  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (id) => set({ activeConversationId: id }),

  // Messages
  messages: {},
  setMessages: (convoId, msgs) => set(s => ({ messages: { ...s.messages, [convoId]: msgs } })),
  appendMessage: (convoId, msg) => set(s => ({
    messages: { ...s.messages, [convoId]: [...(s.messages[convoId] || []), msg] }
  })),
  updateLastMessage: (convoId, updater) => set(s => {
    const msgs = [...(s.messages[convoId] || [])];
    if (!msgs.length) return s;
    msgs[msgs.length - 1] = updater(msgs[msgs.length - 1]);
    return { messages: { ...s.messages, [convoId]: msgs } };
  }),

  // Chat mode
  chatMode: 'agent',
  setChatMode: (mode) => set({ chatMode: mode }),
  selectedTools: [],
  setSelectedTools: (ids) => set({ selectedTools: ids }),

  // Files
  workspaceFiles: [],
  quarantineFiles: [],
  setWorkspaceFiles: (files) => set({ workspaceFiles: files }),
  setQuarantineFiles: (files) => set({ quarantineFiles: files }),

  // Settings
  settings: {},
  setSettings: (settings) => set({ settings }),

  // UI state
  activePanel: 'chat',
  setActivePanel: (panel) => set({ activePanel: panel }),
  isChatting: false,
  setIsChatting: (v) => set({ isChatting: v }),
  statusText: '',
  setStatusText: (text) => set({ statusText: text }),
}));
