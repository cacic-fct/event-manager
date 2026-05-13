# syntax=docker/dockerfile:1
FROM oven/bun:1 AS bun

FROM node:22-trixie-slim AS base
ENV BUN_INSTALL=/usr/local \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /workspace

FROM base AS deps
COPY package.json bun.lock ./

RUN --mount=type=cache,target=/root/.bun/install/cache \
    --mount=type=secret,id=npm_token,env=NODE_AUTH_TOKEN,required=true \
    bun install --frozen-lockfile

FROM deps AS playwright
RUN bun x playwright install chromium

FROM deps AS prisma-deps
COPY apps/events-backend/prisma.config.ts ./apps/events-backend/prisma.config.ts
COPY apps/events-backend/prisma ./apps/events-backend/prisma

WORKDIR /workspace/apps/events-backend

RUN DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public" \
    bun x prisma generate --schema prisma/schema.prisma

FROM prisma-deps AS builder
WORKDIR /workspace

COPY nx.json tsconfig.base.json ./
COPY eslint.config.mjs jest.config.ts jest.preset.js ./

COPY apps/events-backend ./apps/events-backend
COPY shared-data-types ./shared-data-types
COPY shared-utils ./shared-utils
COPY certificate-templates ./certificate-templates

RUN bun x nx run events-backend:build:production

FROM base AS production-deps
ENV NODE_ENV=production

COPY package.json bun.lock ./

RUN --mount=type=cache,target=/root/.bun/install/cache \
    --mount=type=secret,id=npm_token \
    export NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token)" && \
    bun install --frozen-lockfile --production

COPY --from=prisma-deps /workspace/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma-deps /workspace/node_modules/@prisma ./node_modules/@prisma

COPY apps/events-backend/prisma.config.ts ./apps/events-backend/prisma.config.ts
COPY apps/events-backend/prisma ./apps/events-backend/prisma

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

RUN --mount=type=bind,from=deps,source=/workspace,target=/workspace-src,readonly \
    cd /workspace-src \
    && bun x playwright install-deps chromium \
    && apt-get update \
    && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app \
    && useradd --system --gid app --home-dir /app app

COPY --from=production-deps --chown=app:app /workspace/node_modules ./node_modules
COPY --from=production-deps --chown=app:app /workspace/apps/events-backend/prisma.config.ts ./apps/events-backend/prisma.config.ts
COPY --from=production-deps --chown=app:app /workspace/apps/events-backend/prisma ./apps/events-backend/prisma

COPY --from=builder --chown=app:app /workspace/dist/apps/events-backend ./
COPY --from=playwright --chown=app:app /ms-playwright /ms-playwright

COPY --chown=app:app certificate-templates ./certificate-templates

USER app

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "main.js"]