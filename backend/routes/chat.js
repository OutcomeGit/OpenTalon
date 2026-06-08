const http = require('http');
const db = require('../db/database');
const { executeTool } = require('../tools/executor');
const { v4: uuidv4 } = require('uuid');

function getLlamaConfig() {
  const manager = require('../llama');
  const port = manager.port || 8080;
  return {
    baseUrl: `http://localhost:${port}`,
    model: db.prepare("SELECT value FROM settings WHERE key='llamacpp_model'").get()?.value || 'local-model',
    maxTokens: parseInt(db.prepare("SELECT value FROM settings WHERE key='max_tokens'").get()?.value || '2048'),
    temperature: parseFloat(db.prepare("SELECT value FROM settings WHERE key='temperature'").get()?.value || '0.7'),
    systemPrompt: db.prepare("SELECT value FROM settings WHERE key='system_prompt'").get()?.value || 'You are a helpful assistant.',
  };
}

// Native http streaming — avoids node-fetch chunking issues entirely
function streamCompletion(url, body, onToken, onToolCall, onDone, onError) {
  const parsed = new URL(url);
  const postData = JSON.stringify(body);

  const req = http.request({
    hostname: parsed.hostname,
    port: parseInt(parsed.port || '80'),
    path: parsed.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  }, (res) => {
    let buffer = '';
    let fullContent = '';
    const toolCalls = [];

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            fullContent += delta.content;
            onToken(delta.content);
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index || 0;
              if (!toolCalls[idx]) toolCalls[idx] = { id: tc.id || uuidv4(), type: 'function', function: { name: '', arguments: '' } };
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
        } catch {}
      }
    });

    res.on('end', () => onDone(fullContent, toolCalls.filter(Boolean)));
    res.on('error', onError);
  });

  req.on('error', onError);
  req.setTimeout(120000, () => { req.destroy(new Error('Request timeout')); });
  req.write(postData);
  req.end();
}

function getEnabledTools() {
  return db.prepare('SELECT * FROM tools WHERE enabled=1').all().map(t => ({ ...t, config: JSON.parse(t.config) }));
}

function buildToolSchemas(tools) {
  const schemas = {
    web_search:   { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'number' } }, required: ['query'] },
    web_scrape:   { type: 'object', properties: { url: { type: 'string' }, selector: { type: 'string' } }, required: ['url'] },
    file_read:    { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] },
    file_write:   { type: 'object', properties: { file_path: { type: 'string' }, content: { type: 'string' } }, required: ['file_path', 'content'] },
    file_list:    { type: 'object', properties: { directory: { type: 'string', enum: ['workspace', 'quarantine'] } }, required: ['directory'] },
    shell:        { type: 'object', properties: { command: { type: 'string' }, timeout: { type: 'number' } }, required: ['command'] },
    http_request: { type: 'object', properties: { method: { type: 'string' }, url: { type: 'string' }, headers: { type: 'object' }, body: {} }, required: ['url'] },
    code_run:     { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string', enum: ['javascript', 'python3'] } }, required: ['code'] },
    url_check:    { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    ytdlp:        { type: 'object', properties: { url: { type: 'string' }, format: { type: 'string' } }, required: ['url'] },
  };
  return tools.map(t => ({
    type: 'function',
    function: { name: t.id, description: `${t.name}: ${t.description}`, parameters: schemas[t.type] || { type: 'object', properties: {} } }
  }));
}

async function handleChat(ws, payload) {
  const { conversationId, message, mode, selectedTools } = payload;

  // Check llama.cpp is actually running
  const manager = require('../llama');
  if (manager.status !== 'running') {
    ws.send(JSON.stringify({ type: 'error', text: 'llama.cpp is not running. Go to the Models panel and load a model first.' }));
    return;
  }

  // Persist user message
  db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), conversationId, 'user', message);
  db.prepare("UPDATE conversations SET updated_at=datetime('now') WHERE id=?").run(conversationId);

  // Load history
  const history = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC').all(conversationId);
  const messages = history.map(m => {
    const msg = { role: m.role === 'tool' ? 'tool' : m.role, content: m.content };
    if (m.tool_calls) msg.tool_calls = JSON.parse(m.tool_calls);
    return msg;
  });

  const config = getLlamaConfig();

  // Build tools
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

  const runLoop = () => new Promise((resolve, reject) => {
    if (loopCount >= MAX_LOOPS) {
      ws.send(JSON.stringify({ type: 'error', text: 'Max tool loop reached' }));
      return resolve();
    }
    loopCount++;

    const body = {
      model: config.model,
      messages: [{ role: 'system', content: config.systemPrompt }, ...messages],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream: true,
    };
    // Only add tools if model likely supports them — skip for basic models
    // to avoid confusing the chat template
    // if (tools.length > 0) { body.tools = tools; body.tool_choice = 'auto'; }

    streamCompletion(
      `${config.baseUrl}/v1/chat/completions`,
      body,
      // onToken
      (token) => {
        ws.send(JSON.stringify({ type: 'token', text: token }));
      },
      // onToolCall (unused for now)
      () => {},
      // onDone
      async (fullContent, toolCallsList) => {
        const assistantMsgId = uuidv4();
        db.prepare('INSERT INTO messages (id, conversation_id, role, content, tool_calls) VALUES (?, ?, ?, ?, ?)')
          .run(assistantMsgId, conversationId, 'assistant', fullContent, toolCallsList.length ? JSON.stringify(toolCallsList) : null);
        messages.push({ role: 'assistant', content: fullContent });

        if (toolCallsList.length === 0) {
          ws.send(JSON.stringify({ type: 'done', messageId: assistantMsgId }));
          return resolve();
        }

        // Tool execution
        ws.send(JSON.stringify({ type: 'tool_start', tools: toolCallsList.map(tc => ({ id: tc.id, name: toolMap[tc.function.name]?.name || tc.function.name })) }));
        const toolResults = [];
        for (const tc of toolCallsList) {
          const tool = toolMap[tc.function.name];
          if (!tool) {
            toolResults.push({ tool_call_id: tc.id, role: 'tool', content: JSON.stringify({ error: 'Tool not found' }) });
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
        for (const tr of toolResults) {
          db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
            .run(uuidv4(), conversationId, 'tool', tr.content);
          messages.push(tr);
        }
        ws.send(JSON.stringify({ type: 'status', text: 'Processing results...' }));
        resolve(runLoop());
      },
      // onError
      (err) => {
        ws.send(JSON.stringify({ type: 'error', text: `llama.cpp error: ${err.message}` }));
        resolve();
      }
    );
  });

  await runLoop();
}

module.exports = { handleChat };
