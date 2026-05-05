# syntax=docker/dockerfile:1.7

FROM oven/bun:1-alpine AS bun

FROM node:22-alpine AS base
ENV BUN_INSTALL=/usr/local
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /workspace

FROM base AS deps
COPY package.json bun.lock nx.json tsconfig.base.json ./
COPY eslint.config.mjs jest.config.ts jest.preset.js ./
COPY apps/cacic-eventos/project.json apps/cacic-eventos/tsconfig*.json ./apps/cacic-eventos/
COPY shared-angular/project.json shared-angular/tsconfig*.json ./shared-angular/
COPY shared-data-types/project.json shared-data-types/tsconfig*.json ./shared-data-types/
COPY shared-utils/project.json shared-utils/tsconfig*.json ./shared-utils/
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile

FROM deps AS builder
COPY apps/cacic-eventos ./apps/cacic-eventos
COPY shared-angular ./shared-angular
COPY shared-data-types ./shared-data-types
COPY shared-utils ./shared-utils
RUN bun x nx build cacic-eventos --configuration=production

FROM base AS runtime-deps
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile --production

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
  PORT=4000
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=runtime-deps --chown=app:app /workspace/node_modules ./node_modules
COPY --from=builder --chown=app:app /workspace/dist/apps/cacic-eventos ./
USER app
EXPOSE 4000
CMD ["node", "server/server.mjs"]
