# syntax=docker/dockerfile:1.7
#
# Single-container build: nginx (SPA + /ws proxy) + Node presence WebSocket
# server, both kept alive by supervisord. This is the right shape for
# Dokploy / Coolify-style platforms that only deploy one Dockerfile.
# `docker compose up` still works against the same image — only the public
# port mapping differs.

# ---------- Stage 1: pnpm deps for the SPA ----------
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- Stage 2: SPA build ----------
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---------- Stage 3: presence server deps (only `ws`) ----------
FROM node:20-alpine AS presence-deps
WORKDIR /presence
COPY server/package.json ./
RUN npm install --omit=dev --no-package-lock --silent && \
    npm cache clean --force

# ---------- Stage 4: runtime (nginx + node, dumb-init reaps zombies) ----------
FROM nginx:1.27-alpine AS runtime
RUN apk add --no-cache nodejs dumb-init

# SPA bundle
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Presence server (Node + ws)
COPY --from=presence-deps /presence/node_modules /opt/presence/node_modules
COPY server/presence-server.mjs /opt/presence/presence-server.mjs
COPY server/package.json /opt/presence/package.json

# Multi-process launcher
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1/healthz || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/start.sh"]
