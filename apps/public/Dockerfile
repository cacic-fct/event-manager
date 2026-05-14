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
COPY apps/public/project.json apps/public/tsconfig*.json apps/public/ngsw-config.json ./apps/public/
COPY shared-angular/project.json shared-angular/tsconfig*.json ./shared-angular/
COPY shared-data-types/project.json shared-data-types/tsconfig*.json ./shared-data-types/
COPY shared-utils/project.json shared-utils/tsconfig*.json ./shared-utils/
RUN --mount=type=cache,target=/root/.bun/install/cache \
    --mount=type=secret,id=npm_token \
    export NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token)" && \
    bun install --frozen-lockfile

FROM deps AS builder
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

COPY apps/public ./apps/public
COPY shared-angular ./shared-angular
COPY shared-data-types ./shared-data-types
COPY shared-utils ./shared-utils

RUN find . -type f \
    \( -name "*.ts" -o -name "*.js" -o -name "*.html" -o -name "*.json" \) \
    -exec sed -i "s/APP_VERSION_PLACEHOLDER/${APP_VERSION}/g" {} +
RUN bun x nx build public --configuration=production

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
COPY --from=builder --chown=app:app /workspace/dist/apps/public ./
COPY --from=builder ./3rdpartylicenses.txt ./browser

USER app
EXPOSE 4000
CMD ["node", "server/server.mjs"]
