# syntax=docker/dockerfile:1

# ============================================
# Stage 1: Build
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Prisma's engines need OpenSSL to resolve at generate-time on Alpine.
RUN apk add --no-cache openssl

# Copy workspace manifests first (all of them — npm workspaces validates package-lock.json
# against every workspace listed in the root package.json, so client's/shared's must be
# present even though only server's dependencies get installed below).
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
COPY shared/package.json ./shared/

RUN npm ci --workspace=server --include-workspace-root

# Prisma schema is needed for `prisma generate`, which npm's postinstall may already have
# triggered above — copying it before source keeps that layer cached across source-only edits.
COPY server/prisma/ ./server/prisma/
RUN npx prisma generate --schema=server/prisma/schema.prisma

COPY server/ ./server/
COPY shared/ ./shared/

RUN npm run build --workspace=server

# ============================================
# Stage 2: Production
# ============================================
FROM node:20-alpine AS production

# Chromium (for Puppeteer PDF export) + its runtime libs, dumb-init for PID 1 signal handling,
# openssl for Prisma's query engine.
RUN apk add --no-cache \
    dumb-init \
    openssl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
COPY shared/package.json ./shared/

RUN npm ci --workspace=server --include-workspace-root --omit=dev

COPY server/prisma/ ./server/prisma/
RUN npx prisma generate --schema=server/prisma/schema.prisma

COPY --from=builder /app/server/dist ./server/dist
COPY shared/ ./shared/

# Entrypoint script (copied + made executable before switching off root, since appuser can't chmod).
COPY --chmod=755 server/scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Puppeteer needs to write its own user-data-dir; give appuser a home it can write to.
RUN mkdir -p /home/appuser && chown -R appuser:appgroup /home/appuser /app
ENV HOME=/home/appuser

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/docker-entrypoint.sh"]
