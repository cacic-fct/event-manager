# Frontend E2E for coding agents

The Playwright configs are `apps/public-e2e/playwright.config.ts` and `apps/admin-e2e/playwright.config.ts`. Read the relevant config and shared support fixtures before editing or running a flow.

- Set `BASE_URL` to the existing app server. Both configs default to port 4200, so confirm which app it serves. Keep `E2E_START_SERVER` unset; do not launch another frontend/backend server.
- Run a focused flow with `BASE_URL=<existing-url> bunx nx e2e admin-e2e -- --project=chromium` or the public equivalent, adding the relevant spec filter.
- Tests with mocked APIs establish UI behavior, not live authentication, persistence or notification delivery. Use real backend integration coverage for those claims.
- Public ordinary browser projects block service workers. Offline worker tests use the dedicated `service-worker-*` projects and a production build served by an existing server; a development build does not establish offline behavior.
- Prefer shared support fixtures over duplicated session/network setup. Use synthetic users, relative dates or a mocked clock. Preserve query/hash and `/app`/`/admin` mount behavior in navigation assertions.
- For UI changes, check keyboard interaction, confirmation/cancellation, error focus, narrow screens and light/dark modes where relevant. Use strict Axe checks without treating them as proof of complete WCAG compliance.
- Shared component interaction coverage may belong in Storybook instead of another application flow; see [Angular guidance](angular.md).
