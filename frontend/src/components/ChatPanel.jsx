import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Wrench, CheckCircle, XCircle, Loader, ChevronDown, ChevronRight, Zap, MousePointer } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useStore } from '../store';
import { api, ChatSocket } from '../hooks/useApi';
import { v4 as uuidv4 } from 'uuid';

function ToolCallBlock({ name, args, result, error, running }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1 border border-border rounded-lg overflow-hidden text-sm font-mono">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-surface-2 hover:bg-surface-3 transition-colors text-left"
      >
        {running ? (
          <Loader size={13} className="text-accent animate-spin shrink-0" />
        ) : error ? (
          <XCircle size={13} className="text-red-400 shrink-0" />
        ) : (
          <CheckCircle size={13} className="text-green-400 shrink-0" />
        )}
        <Wrench size={12} className="text-accent shrink-0" />
        <span className="text-accent font-semibold">{name}</span>
        {args && <span className="text-muted ml-2 truncate max-w-xs">{JSON.stringify(args).slice(0, 60)}…</span>}
        <span className="ml-auto">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
      </button>
      {open && (
        <div className="px-3 py-2 bg-surface-1 space-y-2">
          {args && (
            <div>
              <div className="text-muted text-xs mb-1">ARGS</div>
              <pre className="text-xs text-text bg-surface-2 rounded p-2 overflow-x-auto">{JSON.stringify(args, null, 2)}</pre>
            </div>
          )}
          {result && (
            <div>
              <div className="text-muted text-xs mb-1">RESULT</div>
              <pre className="text-xs text-green-300 bg-surface-2 rounded p-2 overflow-x-auto max-h-48">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
          {error && (
            <div className="text-red-400 text-xs bg-surface-2 rounded p-2">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === 'user';
  const isAssistant = msg.role === 'assistant';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} animate-fade-in`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isUser ? 'bg-surface-4' : 'bg-accent/20'}`}>
        {isUser ? <User size={13} className="text-text-dim" /> : <Bot size={13} className="text-accent" />}
      </div>
      <div className={`flex-1 max-w-3xl ${isUser ? 'flex flex-col items-end' : ''}`}>
        {msg.tool_calls?.map((tc, i) => (
          <ToolCallBlock
            key={i}
            name={tc.displayName || tc.function?.name || 'tool'}
            args={tc.args}
            result={tc.result}
            error={tc.error}
            running={tc.running}
          />
        ))}
        {msg.content && (
          <div className={`rounded-xl px-4 py-3 ${isUser ? 'bg-surface-3 text-text' : 'bg-surface-1 border border-border text-text'}`}>
            {isUser ? (
              <p className="text-sm leading-relaxed">{msg.content}</p>
            ) : (
              <div className="prose-dark text-sm">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
                {msg.streaming && <span className="cursor-blink text-accent">▋</span>}
              </div>
            )}
          </div>
        )}
        {msg.statusText && (
          <div className="flex items-center gap-2 text-xs text-muted mt-1 ml-1">
            <Loader size={10} className="animate-spin" />
            {msg.statusText}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPanel() {
  const {
    conversations, activeConversationId, setActiveConversation,
    setConversations, messages, setMessages, appendMessage, updateLastMessage,
    chatMode, setChatMode, selectedTools, setSelectedTools,
    tools, isChatting, setIsChatting, statusText, setStatusText,
  } = useStore();

  const [input, setInput] = useState('');
  const [showConvos, setShowConvos] = useState(true);
  const [showToolPicker, setShowToolPicker] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const socketRef = useRef(null);
  const activeConvo = conversations.find(c => c.id === activeConversationId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages[activeConversationId]]);

  async function newConversation() {
    const convo = await api.createConversation({ title: 'New Chat', mode: chatMode });
    const updated = await api.getConversations();
    setConversations(updated);
    setActiveConversation(convo.id);
    setMessages(convo.id, []);
  }

  async function loadConversation(id) {
    setActiveConversation(id);
    if (!messages[id]) {
      const msgs = await api.getMessages(id);
      setMessages(id, msgs);
    }
  }

  async function sendMessage() {
    if (!input.trim() || isChatting || !activeConversationId) return;
    const text = input.trim();
    setInput('');
    setIsChatting(true);

    appendMessage(activeConversationId, { id: uuidv4(), role: 'user', content: text });
    const aiMsgId = uuidv4();
    appendMessage(activeConversationId, { id: aiMsgId, role: 'assistant', content: '', streaming: true, tool_calls: [], statusText: 'Thinking...' });

    const socket = new ChatSocket((event) => {
      switch (event.type) {
        case 'token':
          updateLastMessage(activeConversationId, m => ({ ...m, content: m.content + event.text, statusText: null }));
          break;
        case 'status':
          updateLastMessage(activeConversationId, m => ({ ...m, statusText: event.text }));
          break;
        case 'tool_start':
          updateLastMessage(activeConversationId, m => ({
            ...m,
            statusText: `Running ${event.tools.length} tool(s)…`,
            tool_calls: event.tools.map(t => ({ id: t.id, displayName: t.name, running: true, args: null, result: null })),
          }));
          break;
        case 'tool_running':
          updateLastMessage(activeConversationId, m => ({
            ...m,
            tool_calls: m.tool_calls.map(tc =>
              tc.id === event.id ? { ...tc, args: event.args, running: true } : tc
            ),
          }));
          break;
        case 'tool_result':
          updateLastMessage(activeConversationId, m => ({
            ...m,
            statusText: 'Processing results…',
            tool_calls: m.tool_calls.map(tc =>
              tc.id === event.id ? { ...tc, result: event.result, running: false } : tc
            ),
          }));
          break;
        case 'tool_error':
          updateLastMessage(activeConversationId, m => ({
            ...m,
            tool_calls: m.tool_calls.map(tc =>
              tc.id === event.id ? { ...tc, error: event.error, running: false } : tc
            ),
          }));
          break;
        case 'done':
          updateLastMessage(activeConversationId, m => ({ ...m, streaming: false, statusText: null }));
          setIsChatting(false);
          socket.close();
          break;
        case 'error':
          updateLastMessage(activeConversationId, m => ({ ...m, content: m.content || event.text, streaming: false, statusText: null }));
          setIsChatting(false);
          socket.close();
          break;
      }
    });

    socketRef.current = socket;
    await socket.connect();
    socket.send({
      conversationId: activeConversationId,
      message: text,
      mode: chatMode,
      selectedTools: chatMode === 'manual' ? selectedTools : undefined,
    });
  }

  const enabledTools = tools.filter(t => t.enabled);

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="w-52 shrink-0 border-r border-border flex flex-col bg-surface-1">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">Chats</span>
          <button onClick={newConversation} className="text-xs text-accent hover:text-claw-300 font-mono">+ New</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map(c => (
            <button
              key={c.id}
              onClick={() => loadConversation(c.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                c.id === activeConversationId
                  ? 'bg-accent/15 text-accent border border-accent/20'
                  : 'text-text-dim hover:bg-surface-3 hover:text-text'
              }`}
            >
              <div className="truncate font-medium">{c.title}</div>
              <div className={`text-[10px] mt-0.5 ${c.id === activeConversationId ? 'text-accent/60' : 'text-muted'}`}>
                {c.mode}
              </div>
            </button>
          ))}
          {conversations.length === 0 && (
            <div className="text-center py-8 text-muted text-xs">No chats yet</div>
          )}
        </div>
      </div>

      {/* Main chat */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-surface-1 shrink-0">
          <div className="flex-1">
            <h2 className="text-sm font-semibold font-display">{activeConvo?.title || 'OpenTalon'}</h2>
            {enabledTools.length > 0 && (
              <p className="text-xs text-muted">{enabledTools.length} tool{enabledTools.length !== 1 ? 's' : ''} available</p>
            )}
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-1">
            <button
              onClick={() => setChatMode('agent')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${chatMode === 'agent' ? 'bg-accent text-black' : 'text-muted hover:text-text'}`}
            >
              <Zap size={11} />
              Agent
            </button>
            <button
              onClick={() => { setChatMode('manual'); setShowToolPicker(true); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${chatMode === 'manual' ? 'bg-accent text-black' : 'text-muted hover:text-text'}`}
            >
              <MousePointer size={11} />
              Manual
            </button>
          </div>
        </div>

        {/* Manual tool picker */}
        {chatMode === 'manual' && showToolPicker && (
          <div className="px-4 py-2 border-b border-border bg-surface-2 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted shrink-0">Active tools:</span>
            {enabledTools.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTools(
                  selectedTools.includes(t.id)
                    ? selectedTools.filter(id => id !== t.id)
                    : [...selectedTools, t.id]
                )}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border transition-all ${
                  selectedTools.includes(t.id)
                    ? 'bg-accent/15 border-accent/40 text-accent'
                    : 'border-border text-muted hover:border-accent/30 hover:text-text'
                }`}
              >
                <Wrench size={10} />
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        {!activeConversationId ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
              <Zap size={22} className="text-accent" />
            </div>
            <div>
              <h3 className="text-base font-semibold font-display">OpenTalon</h3>
              <p className="text-sm text-muted mt-1">Select a chat or start a new one</p>
            </div>
            <button onClick={newConversation} className="mt-2 px-4 py-2 bg-accent text-black text-sm font-semibold rounded-lg hover:bg-claw-400 transition-colors">
              Start Chat
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {(messages[activeConversationId] || []).map(msg => (
              <Message key={msg.id} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Input */}
        {activeConversationId && (
          <div className="p-4 border-t border-border bg-surface-1 shrink-0">
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder={isChatting ? 'Agent is working…' : 'Message… (Enter to send, Shift+Enter for newline)'}
                  disabled={isChatting}
                  rows={1}
                  style={{ resize: 'none', minHeight: '42px', maxHeight: '160px', overflow: 'auto' }}
                  className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={isChatting || !input.trim()}
                className="w-10 h-10 rounded-xl bg-accent hover:bg-claw-400 text-black flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {isChatting ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
