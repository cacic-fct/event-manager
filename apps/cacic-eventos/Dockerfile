# syntax=docker/dockerfile:1
FROM oven/bun:1-alpine AS bun

FROM node:22-alpine AS base
ENV BUN_INSTALL=/usr/local
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /workspace

FROM base AS deps
COPY package.json bun.lock nx.json tsconfig.base.json ./
COPY .npmrc ./
COPY eslint.config.mjs jest.config.ts jest.preset.js ./
COPY apps/cacic-eventos/project.json apps/cacic-eventos/tsconfig*.json ./apps/cacic-eventos/
COPY libs/shared-angular/project.json libs/shared-angular/tsconfig*.json ./libs/shared-angular/
COPY libs/shared-data-types/project.json libs/shared-data-types/tsconfig*.json ./libs/shared-data-types/
COPY libs/shared-utils/project.json libs/shared-utils/tsconfig*.json ./libs/shared-utils/
COPY libs/shared-notifications-angular/project.json libs/shared-notifications-angular/tsconfig*.json ./libs/shared-notifications-angular/
COPY libs/shared-environment/project.json libs/shared-environment/tsconfig*.json ./libs/shared-environment/
RUN --mount=type=cache,target=/root/.bun/install/cache \
    --mount=type=secret,id=npm_token \
    export NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token)" && \
    bun install --frozen-lockfile

FROM deps AS builder
COPY apps/cacic-eventos ./apps/cacic-eventos
COPY libs/shared-angular ./libs/shared-angular
COPY libs/shared-data-types ./libs/shared-data-types
COPY libs/shared-utils ./libs/shared-utils
COPY libs/shared-notifications-angular ./libs/shared-notifications-angular
COPY libs/shared-environment ./libs/shared-environment
RUN bun x nx build cacic-eventos --configuration=production

FROM base AS runtime-deps
ENV NODE_ENV=production
COPY package.json bun.lock ./
COPY .npmrc ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    --mount=type=secret,id=npm_token,env=NODE_AUTH_TOKEN,required=true \
    bun install --frozen-lockfile

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
