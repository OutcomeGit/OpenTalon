# OpenTalon

Visual agent control frontend for OpenClaw + llama.cpp. Deploy as a single Docker container on TrueNAS Scale.

## What it does

- **Chat** with your local LLM in agent or manual mode
- **Tools** — visual control over every tool: toggle, configure, test, create custom ones
- **Workflows** — chain tools into reusable visual sequences
- **Files** — workspace + quarantine zone for web downloads, with in-app previews
- **Privacy** — optional Tor/I2P proxy routing, URL pre-screening via VirusTotal

## Quick Start

### Option 1 — Docker Compose

```bash
git clone https://github.com/yourusername/opentalon
cd opentalon
docker compose up -d
```

Open http://localhost:8765

### Option 2 — TrueNAS Scale Custom App

1. Push repo to GitHub
2. In TrueNAS Scale → Apps → Discover → Custom App
3. Image: `ghcr.io/yourusername/opentalon:latest` (after setting up GitHub Actions)
4. Port: 8765 → 8765
5. Storage: add a host path or ix-volume mounted to `/data`

## Configuration

All settings live in the Settings panel. Key fields:

| Setting | Default | Notes |
|---|---|---|
| llama.cpp URL | `http://localhost:8080` | Use `http://host.docker.internal:8080` if llama.cpp runs on the host |
| Model Name | `local-model` | Must match what llama.cpp reports |
| Proxy | Off | Tor (port 9050) or I2P (port 4444) — must be running separately |
| VirusTotal API Key | None | Free tier at virustotal.com — optional URL pre-screening |

## Tools

All tools are pre-configured with sane defaults. Each can be:
- Toggled on/off (affects both agent and manual mode)
- Configured (per-tool JSON config editor)
- Tested in isolation (test runner with args)
- Deleted or replaced with custom versions

### Built-in tools

| Tool | Type | Notes |
|---|---|---|
| Web Search | `web_search` | DuckDuckGo HTML — no API key needed |
| Web Scrape | `web_scrape` | JS-disabled by default; downloads go to quarantine |
| File Read | `file_read` | Workspace only — path traversal blocked |
| File Write | `file_write` | Workspace only |
| File List | `file_list` | Workspace + quarantine |
| Shell Execute | `shell` | Common destructive commands blocked |
| HTTP Request | `http_request` | Full control over method/headers/body |
| Code Run | `code_run` | JS (Node) or Python — executed in workspace dir |
| URL Safety Check | `url_check` | VirusTotal pre-screen — needs API key |
| yt-dlp Download | `ytdlp` | Downloads to quarantine |

## Chat Modes

**Agent mode** — the LLM decides which tools to call and when. You watch the reasoning unfold in real time.

**Manual mode** — you pick which tools are available for that conversation before sending. The LLM can only call the ones you selected.

## Files & Quarantine

Any file downloaded from the web (via `web_scrape` or `yt-dlp`) lands in **Quarantine** first. You review it, preview it if possible, then move it to **Workspace** when you're satisfied it's safe. The LLM cannot access quarantine files directly.

## Privacy

The proxy setting routes all `web_search`, `web_scrape`, and `http_request` tool calls through SOCKS5. Tor and I2P must be running on your host or as a sidecar container.

To run Tor alongside:
```yaml
# Add to docker-compose.yml
tor:
  image: dperson/torproxy
  ports:
    - "9050:9050"
```
Then set proxy host to `tor` (service name) and port `9050`.

## Telegram Bot (planned v2)

A separate conversation chain that shares the same tool backend but runs independently. Messages from Telegram don't cross-contaminate your local chat history.

## Dev

```bash
cd backend && npm install && node server.js   # port 8765
cd frontend && npm install && npm run dev     # port 5173, proxies to 8765
```
