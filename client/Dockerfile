# syntax=docker/dockerfile:1

# ============================================
# Stage 1: Build the React app
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first (all of them — npm workspaces validates package-lock.json
# against every workspace listed in the root package.json, so server's/shared's must be
# present even though only client's dependencies get installed below).
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/

RUN npm ci --workspace=client --include-workspace-root

COPY client/ ./client/
COPY shared/ ./shared/

# No VITE_API_URL/VITE_WS_URL build args here on purpose: the client only ever issues relative
# fetch()/WebSocket calls resolved against window.location (see src/api/axios.ts and
# src/lib/WebSocketProvider.ts's buildUrl) — the same code path Nginx's /api and /ws proxy
# below is designed for. There is no separate API origin to bake in at build time.
RUN npm run build --workspace=client

# ============================================
# Stage 2: Serve with Nginx
# ============================================
FROM nginx:1.25-alpine AS production

COPY client/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
