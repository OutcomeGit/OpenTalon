const db = require('../db/database');
const { executeTool } = require('../tools/executor');
const { v4: uuidv4 } = require('uuid');

async function getLlamaCppClient() {
  const fetch = (await import('node-fetch')).default;
  const manager = require('../llama');
  const port = manager.port || 8080;
  const baseUrl = `http://localhost:${port}`;
  const model = db.prepare("SELECT value FROM settings WHERE key='llamacpp_model'").get()?.value || 'local-model';
  const maxTokens = parseInt(db.prepare("SELECT value FROM settings WHERE key='max_tokens'").get()?.value || '4096');
  const temperature = parseFloat(db.prepare("SELECT value FROM settings WHERE key='temperature'").get()?.value || '0.7');
  const systemPrompt = db.prepare("SELECT value FROM settings WHERE key='system_prompt'").get()?.value || '';
  return { fetch, baseUrl, model, maxTokens, temperature, systemPrompt };
}

function getEnabledTools() {
  return db.prepare('SELECT * FROM tools WHERE enabled=1').all().map(t => ({
    ...t, config: JSON.parse(t.config)
  }));
}

function buildToolSchemas(tools) {
  const schemas = {
    web_search: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'number' } }, required: ['query'] },
    web_scrape: { type: 'object', properties: { url: { type: 'string' }, selector: { type: 'string' } }, required: ['url'] },
    file_read: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] },
    file_write: { type: 'object', properties: { file_path: { type: 'string' }, content: { type: 'string' } }, required: ['file_path', 'content'] },
    file_list: { type: 'object', properties: { directory: { type: 'string', enum: ['workspace', 'quarantine'] } }, required: ['directory'] },
    shell: { type: 'object', properties: { command: { type: 'string' }, timeout: { type: 'number' } }, required: ['command'] },
    http_request: { type: 'object', properties: { method: { type: 'string' }, url: { type: 'string' }, headers: { type: 'object' }, body: {} }, required: ['url'] },
    code_run: { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string', enum: ['javascript', 'python3'] } }, required: ['code'] },
    url_check: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    ytdlp: { type: 'object', properties: { url: { type: 'string' }, format: { type: 'string' } }, required: ['url'] },
  };
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.id,
      description: `${t.name}: ${t.description}`,
      parameters: schemas[t.type] || { type: 'object', properties: {} },
    }
  }));
}

async function handleChat(ws, payload) {
  const { conversationId, message, mode, selectedTools } = payload;

  // Persist user message
  const userMsgId = uuidv4();
  db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
    .run(userMsgId, conversationId, 'user', message);
  db.prepare("UPDATE conversations SET updated_at=datetime('now') WHERE id=?").run(conversationId);

  // Load history
  const history = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC').all(conversationId);
  const messages = history.map(m => {
    const msg = { role: m.role, content: m.content };
    if (m.tool_calls) msg.tool_calls = JSON.parse(m.tool_calls);
    return msg;
  });

  const { fetch, baseUrl, model, maxTokens, temperature, systemPrompt } = await getLlamaCppClient();

  // Build tool list based on mode
  let tools = [];
  let toolMap = {};
  if (mode === 'agent') {
    const enabled = getEnabledTools();
    tools = buildToolSchemas(enabled);
    enabled.forEach(t => { toolMap[t.id] = t; });
  } else if (mode === 'manual' && selectedTools?.length) {
    const all = getEnabledTools();
    const chosen = all.filter(t => selectedTools.includes(t.id));
    tools = buildToolSchemas(chosen);
    chosen.forEach(t => { toolMap[t.id] = t; });
  }

  ws.send(JSON.stringify({ type: 'status', text: 'Thinking...' }));

  let loopCount = 0;
  const MAX_LOOPS = 10;

  while (loopCount < MAX_LOOPS) {
    loopCount++;

    const body = {
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: maxTokens,
      temperature,
      stream: true,
    };
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    let response;
    try {
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', text: `Cannot reach llama.cpp: ${e.message}` }));
      return;
    }

    // Stream response
    let fullContent = '';
    let toolCalls = [];
    let currentToolCall = null;

    const reader = response.body;
    let buffer = '';

    for await (const chunk of reader) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            fullContent += delta.content;
            ws.send(JSON.stringify({ type: 'token', text: delta.content }));
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCalls[idx]) toolCalls[idx] = { id: tc.id || uuidv4(), type: 'function', function: { name: '', arguments: '' } };
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
        } catch {}
      }
    }

    // Save assistant message
    const assistantMsgId = uuidv4();
    db.prepare('INSERT INTO messages (id, conversation_id, role, content, tool_calls) VALUES (?, ?, ?, ?, ?)')
      .run(assistantMsgId, conversationId, 'assistant', fullContent, toolCalls.length ? JSON.stringify(toolCalls) : null);

    messages.push({ role: 'assistant', content: fullContent, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });

    // If no tool calls, we're done
    if (toolCalls.length === 0) {
      ws.send(JSON.stringify({ type: 'done', messageId: assistantMsgId }));
      return;
    }

    // Execute tool calls
    ws.send(JSON.stringify({ type: 'tool_start', tools: toolCalls.map(tc => ({ id: tc.id, name: toolMap[tc.function.name]?.name || tc.function.name })) }));

    const toolResults = [];
    for (const tc of toolCalls) {
      const tool = toolMap[tc.function.name];
      if (!tool) {
        toolResults.push({ tool_call_id: tc.id, role: 'tool', content: JSON.stringify({ error: 'Tool not found or not enabled' }) });
        continue;
      }
      let args = {};
      try { args = JSON.parse(tc.function.arguments); } catch {}

      ws.send(JSON.stringify({ type: 'tool_running', id: tc.id, name: tool.name, args }));

      let result;
      try {
        result = await executeTool(tool, args);
        ws.send(JSON.stringify({ type: 'tool_result', id: tc.id, name: tool.name, result }));
      } catch (e) {
        result = { error: e.message };
        ws.send(JSON.stringify({ type: 'tool_error', id: tc.id, name: tool.name, error: e.message }));
      }
      toolResults.push({ tool_call_id: tc.id, role: 'tool', content: JSON.stringify(result) });
    }

    // Add tool results to history and loop
    for (const tr of toolResults) {
      db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
        .run(uuidv4(), conversationId, 'tool', tr.content);
      messages.push(tr);
    }
    ws.send(JSON.stringify({ type: 'status', text: 'Processing results...' }));
  }

  ws.send(JSON.stringify({ type: 'error', text: 'Max tool loop reached' }));
}

module.exports = { handleChat };
