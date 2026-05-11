# BizerBrain — multi-stage build.
# Final image runs nginx (serving the notes-app SPA) and a file-api sidecar
# (persisting markdown to $BRAIN_DIR, default /brain).

# ── Stage 1: build the notes-app SPA ─────────────────────────────────────────
FROM node:22-alpine AS notes-app-builder
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY packages/notes-app/package.json packages/notes-app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY packages/notes-app/ ./
RUN pnpm build

# ── Stage 2: install the file-api runtime ────────────────────────────────────
FROM node:22-alpine AS file-api-builder
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY packages/file-api/package.json packages/file-api/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY packages/file-api/src ./src

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine

# nginx is the front door; tini reaps zombies and forwards signals.
RUN apk add --no-cache nginx tini

# SPA bundle.
COPY --from=notes-app-builder /build/dist /usr/share/nginx/html

# File-api source + node_modules.
COPY --from=file-api-builder /build /opt/file-api

# nginx + entrypoint configuration.
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# /brain is the markdown persistence root. Mount a host volume here.
ENV BRAIN_DIR=/brain
VOLUME ["/brain"]

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
