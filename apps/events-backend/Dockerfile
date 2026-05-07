# syntax=docker/dockerfile:1.7

FROM oven/bun:1-alpine AS bun

FROM node:22-alpine AS base
ENV BUN_INSTALL=/usr/local
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /workspace

FROM base AS deps
COPY package.json bun.lock nx.json tsconfig.base.json ./
COPY eslint.config.mjs jest.config.ts jest.preset.js prisma.config.ts ./
COPY apps/events-backend/project.json apps/events-backend/tsconfig*.json apps/events-backend/webpack.config.js ./apps/events-backend/
COPY apps/events-backend/prisma ./apps/events-backend/prisma
COPY shared-data-types/project.json shared-data-types/tsconfig*.json ./shared-data-types/
COPY shared-utils/project.json shared-utils/tsconfig*.json ./shared-utils/
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile
RUN bun x prisma generate --schema apps/events-backend/prisma/schema.prisma

FROM deps AS builder
COPY apps/events-backend ./apps/events-backend
COPY shared-data-types ./shared-data-types
COPY shared-utils ./shared-utils
RUN bun x nx run events-backend:prune

FROM base AS runtime-deps
ENV NODE_ENV=production
COPY --from=builder /workspace/dist/apps/events-backend/package.json ./
COPY bun.lock ./
COPY --from=builder /workspace/dist/apps/events-backend/workspace_modules ./workspace_modules
COPY apps/events-backend/prisma ./apps/events-backend/prisma
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile --production
RUN bun x prisma generate --schema apps/events-backend/prisma/schema.prisma

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
  PORT=3000
WORKDIR /app
RUN apk add --no-cache dumb-init \
  && addgroup -S app \
  && adduser -S app -G app
COPY --from=runtime-deps --chown=app:app /workspace/node_modules ./node_modules
COPY --from=builder --chown=app:app /workspace/dist/apps/events-backend ./
COPY --chown=app:app certificate-templates ./certificate-templates
USER app
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "main.js"]
