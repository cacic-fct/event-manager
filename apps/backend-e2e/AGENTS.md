# Backend integration and E2E

Read the [backend guide](../backend/AGENTS.md) before changing domain integration tests. Commands run from the repository root.

- `project.json` declares the Jest E2E target and Keycloak runner targets. Use `bun run e2e:backend:keycloak` for the isolated Keycloak path; inspect `tools/run-backend-keycloak-e2e.mjs` and its setup before running it. The `real-infra` target has different dependencies; do not treat it as interchangeable.
- The standard backend Jest suite excludes some dedicated data-transfer and subscription-counter database suites. Their targets/configs are in `apps/backend/project.json`.
- `bun run test:database:pglite` and `backend:test-data-transfer-integration` exercise isolated SQL behavior. PostgreSQL/PostGIS is still required for full migrations, Prisma integration and overlapping transactions/locks. `.github/workflows/ci.yml` records the current split.
- Read database setup before executing it. Do not apply migrations without user confirmation, and do not reset or reuse a production database as a test database.
- Cover scoped denial, cross-audience access, rollback/audit consistency and conflict/retry behavior when those guarantees change. For concurrency, use independent sessions with genuinely overlapping work; mocked calls cannot establish isolation.
- Reuse the existing support/HTTP app setup and shared fixtures. Use relative dates or a controlled clock; never copy real personal data into fixtures.
- Run relevant lint and report exactly which infrastructure was used. A mocked GraphQL schema test, PGlite check, real PostgreSQL test and live Keycloak E2E establish different guarantees.
