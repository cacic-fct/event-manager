# Admin app agent guide

The root [AGENTS.md](../../AGENTS.md) applies here. Read [Angular conventions](../../agent-guides/angular.md) before changing frontend code. This Angular SSR application is mounted at `/admin/`. Read [DESIGN.md](DESIGN.md) for the existing admin interface conventions.

- Routes and render modes live in `src/app/app.routes.ts` and `src/app/app.routes.server.ts`.
- Use the [shared permission catalog](../../libs/shared-permissions/AGENTS.md) for tab/action visibility. `src/app/permissions/permissions.service.ts` evaluates permissions with the backend; that result can admit a tab without authorizing every row. Keep scoped denial actionable in the UI.
- Permission management uses roles, person/group assignments, scopes and independent validity windows. Preserve dependency explanations, unsaved-change review and optimistic versions. Read [backend authorization instructions](../backend/src/app/authorization/AGENTS.md) before changing that contract.
- New state-changing actions need an audit record at the backend boundary, not a browser-only log. Authorization, audience filtering, audit attribution and frozen-resource enforcement belong in the backend.
- Keep admin GraphQL contracts in sync with the owning resolvers and `libs/event-manager-admin-contracts`. Reuse API services under `src/app/graphql` where applicable.
- `/admin/content-reviews` uses `src/app/content-reviews`; read the [backend review guide](../backend/src/app/content-review/README.md) before changing selection, revision handling or decisions. Preserve cancellation, confirmation, error focus and reviewer audit semantics.
- Certificate “Permitir emissão” may defer issuance until eligibility returns. Preserve its distinction from an immediate successful issuance; see the [certificate guide](../backend/src/app/certificate/README.md).
- Usage reports require `usage-metrics#read`; opening the authenticated Umami dashboard also requires access in Umami. See [shared analytics](../../libs/shared-analytics/README.md).
- Notifications share the [inbox library](../../libs/shared-notifications-angular/README.md); preserve the `/admin` mount when following notification links.

Use `src/app/testing` and shared library fixtures. Storybook should include permission-denied, frozen, pending, stale-revision and failed-action states when relevant, with MSW for HTTP-dependent stories.

Run `bunx nx lint admin`, relevant `bunx nx test admin --include='<spec-glob>'` suites, and `bunx nx build-storybook admin --configuration=ci` when editing components with stories. Review E2E coverage lives in `../admin-e2e/src/content-reviews.spec.ts`; follow [frontend E2E guidance](../../agent-guides/frontend-e2e.md).
