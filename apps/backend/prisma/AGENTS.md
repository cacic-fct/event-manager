# Prisma and migration instructions

Read the [backend guide](../AGENTS.md). The schema is split across `schema/*.prisma`; migrations live in `migrations`. The datasource/config is in `../prisma.config.ts`.

- After any schema edit, run `bunx prisma generate --schema apps/backend/prisma/schema` from the repository root before lint, tests, type checking or builds.
- `schema/base.prisma` registers the client, audience-relation and ERD generators. Change their sources, not generated `audience-relations.generated.ts` or `database-erd.md`. Audience metadata affects access filtering and relation ownership.
- Do not run migrations without user confirmation. Do not use reset or schema-push commands as shortcuts. Migration files do not prove an environment has applied them.
- Preserve mapped table/field names, soft-delete or archive semantics, partial indexes and existing SQL column types. UUID-shaped string IDs do not imply a PostgreSQL UUID column; inspect the schema and prior SQL before choosing a type.
- Create a new migration rather than modifying a migration already applied to an environment. Review foreign keys, nullable transitions, defaults, existing rows and data backfills together.
- Keep audit/search retention indexes and audience relation changes aligned with their owning modules. New personal-data relations also require [LGPD export/deletion review](../src/app/lgpd/README.md).
- Choose database checks according to the guarantee: PGlite for isolated SQL fixtures; real PostgreSQL/PostGIS for full migration chains, Prisma adapters and concurrent transactions/locks. See [backend E2E](../../backend-e2e/AGENTS.md).
- Keep credentials and production snapshots out of fixtures and documentation. Use isolated test databases and inspect destructive setup before running it.
