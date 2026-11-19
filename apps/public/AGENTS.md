# Public app agent guide

The root [AGENTS.md](../../AGENTS.md) applies here. Read [Angular conventions](../../agent-guides/angular.md) before changing frontend code. This Angular SSR application is mounted at `/app/`.

- Client routes live in `src/app/app.routes.ts`; evaluate render mode in `src/app/app.routes.server.ts` when adding or changing browser-dependent pages.
- Authentication, browser connectivity, IndexedDB and realtime invalidation can become ready at different times. Use reactive state and guard browser APIs during SSR.
- For “Minhas participações”, read the [attendance guide](src/app/profile/attendance/README.md) before changing loading, caching, offline data or certificate actions.
- Workbox is built separately after the Angular production build. Read the [worker guide](workbox/README.md) before changing cache or update behavior; `public:build-application` alone does not verify the final worker.
- Notifications use the [shared inbox](../../libs/shared-notifications-angular/README.md). Keep content clear of the bottom toolbar using the existing `--app-bottom-toolbar-height` layout convention.
- Lecturer self-edits and material edits have different publication rules: see the [review guide](../backend/src/app/content-review/README.md). Frozen material editors keep saved links accessible while blocking edits.
- Browser analytics consent comes from Account Manager. Reuse the existing privacy/analytics services and the allowlisted contracts in [shared analytics](../../libs/shared-analytics/README.md).

Use fixtures from `@cacic-fct/event-manager-public-testing`, `@cacic-fct/shared-angular/testing` and `src/app/testing` as appropriate. Prefer MSW for stories that exercise HTTP behavior. Keep real personal data out of fixtures.

Run `bunx nx lint public` and relevant `bunx nx test public --include='<spec-glob>'` suites. For visual changes, run `bunx nx build-storybook public --configuration=ci` and exercise relevant stories in light/dark themes and narrow viewports, including loading, error, empty and offline states. Public E2E lives in `../public-e2e`; follow [frontend E2E guidance](../../agent-guides/frontend-e2e.md).
