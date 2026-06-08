const express = require('express');
const cors = require('cors');
const path = require('path');
const expressWs = require('express-ws');
const apiRoutes = require('./routes/api');
const modelsRoutes = require('./routes/models');
const llamaCtlRoutes = require('./routes/llamactl');
const { handleChat } = require('./routes/chat');

const app = express();
expressWs(app);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api', apiRoutes);
app.use('/api/models', modelsRoutes);
app.use('/api/llama', llamaCtlRoutes);

// WebSocket chat endpoint
app.ws('/ws/chat', (ws, req) => {
  ws.on('message', async (raw) => {
    try {
      const payload = JSON.parse(raw);
      await handleChat(ws, payload);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', text: e.message }));
    }
  });
});

// Serve frontend build in production
const frontendDist = path.join(__dirname, '../frontend/dist');
const fs = require('fs');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

const PORT = process.env.PORT || 8765;
app.listen(PORT, '0.0.0.0', () => {
  const { MODELS_DIR } = require('./routes/models');
  console.log(`OpenTalon running on http://0.0.0.0:${PORT}`);
  console.log(`Models directory: ${MODELS_DIR}`);
});
