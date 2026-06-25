# syntax=docker/dockerfile:1
FROM oven/bun:1-alpine AS bun

FROM node:26-alpine AS base
ENV BUN_INSTALL=/usr/local \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROME_DOWNLOAD=true
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /workspace

FROM base AS deps
COPY package.json bun.lock nx.json tsconfig.base.json ./
COPY .npmrc ./
COPY eslint.config.mjs jest.config.ts jest.preset.js ./
COPY apps/admin/project.json apps/admin/tsconfig*.json ./apps/admin/
RUN --mount=type=cache,target=/root/.bun/install/cache \
    set -eu; \
    bun install --frozen-lockfile

FROM deps AS builder
COPY apps/admin ./apps/admin
COPY libs ./libs
RUN bun x nx build admin --configuration=production

FROM base AS production-deps
COPY package.json bun.lock ./
COPY .npmrc ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    set -eu; \
    bun install --frozen-lockfile --production

FROM node:26-alpine AS runtime
ENV NODE_ENV=production \
  PORT=4000
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=production-deps --chown=app:app /workspace/node_modules ./node_modules
COPY --from=builder --chown=app:app /workspace/dist/apps/admin ./
USER app
EXPOSE 4000
CMD ["node", "server/server.mjs"]
