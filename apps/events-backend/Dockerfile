FROM oven/bun:1 AS bun

FROM node:22-trixie-slim AS base
ENV BUN_INSTALL=/usr/local \
  PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
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

RUN bun x playwright install --with-deps chromium

FROM deps AS builder
COPY apps/events-backend ./apps/events-backend
COPY shared-data-types ./shared-data-types
COPY shared-utils ./shared-utils
COPY certificate-templates ./certificate-templates

RUN bun x nx run events-backend:build:production

FROM deps AS production-deps
ENV NODE_ENV=production

RUN rm -rf node_modules
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile --production

RUN bun x prisma generate --schema apps/events-backend/prisma/schema.prisma

FROM production-deps AS runtime
ENV NODE_ENV=production \
  PORT=3000 \
  PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system app \
  && useradd --system --gid app --home-dir /app app

COPY --from=production-deps --chown=app:app /workspace/node_modules ./node_modules

# Keep Prisma CLI available for the migration container even if prisma is a devDependency.
COPY --from=deps --chown=app:app /workspace/node_modules/prisma ./node_modules/prisma
COPY --from=deps --chown=app:app /workspace/node_modules/@prisma ./node_modules/@prisma

COPY --from=builder --chown=app:app /workspace/dist/apps/events-backend ./
COPY --from=production-deps --chown=app:app /workspace/apps/events-backend/prisma ./apps/events-backend/prisma
COPY --chown=app:app certificate-templates ./certificate-templates

USER app

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "main.js"]