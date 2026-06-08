# ─── Stage 1: Build llama.cpp server binary ───────────────────────────────────
FROM ubuntu:22.04 AS llama-builder

RUN apt-get update && apt-get install -y \
    build-essential cmake git curl \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth=1 https://github.com/ggerganov/llama.cpp /llama.cpp
WORKDIR /llama.cpp
RUN cmake -B build \
    -DLLAMA_BUILD_SERVER=ON \
    -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build --config Release -t llama-server -j$(nproc)

# ─── Stage 2: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ─── Stage 3: Final image ─────────────────────────────────────────────────────
FROM ubuntu:22.04

# Runtime deps
RUN apt-get update && apt-get install -y \
    curl python3 python3-pip nodejs npm ffmpeg \
    && pip3 install yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# llama.cpp server binary + shared libs
COPY --from=llama-builder /llama.cpp/build/bin/llama-server /usr/local/bin/llama-server
COPY --from=llama-builder /llama.cpp/build/src/*.so* /usr/local/lib/ 2>/dev/null || true
COPY --from=llama-builder /llama.cpp/build/ggml/src/*.so* /usr/local/lib/ 2>/dev/null || true
RUN ldconfig

# Backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./

# Frontend build
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Data dirs
RUN mkdir -p /data/workspace /data/quarantine /data/models

ENV PORT=8765
ENV DATA_DIR=/data
ENV WORKSPACE_DIR=/data/workspace
ENV QUARANTINE_DIR=/data/quarantine
ENV MODELS_DIR=/data/models
ENV LLAMA_PORT=8080
ENV NODE_ENV=production

EXPOSE 8765 8080

HEALTHCHECK --interval=30s --timeout=5s \
    CMD curl -f http://localhost:8765/api/settings || exit 1

CMD ["node", "server.js"]
