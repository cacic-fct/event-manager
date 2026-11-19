# Public service worker

[cacic-public-worker.js](cacic-public-worker.js) is the Workbox source. [build-public-workbox.mjs](build-public-workbox.mjs) assembles the worker from the final Angular output. Edit these sources, not generated files in `dist`.

`public:build` runs `public:build-application` and then the Workbox step in production. The development configuration skips worker generation. A development-server check therefore cannot establish production offline behavior.

- Keep precache coverage and CSP nonce handling aligned with the SSR application. Regression tests live beside the worker and build helpers.
- Update progress counts completed precache files, including cache hits; it is not a byte/download percentage. First installation does not interrupt the current visit with update progress.
- Preserve the existing automatic activation/reload behavior. The client tracks the installing worker and rejects unrelated progress messages.
- Client recovery is based on 90 seconds without progress, not total update duration. Continued progress must reset the inactivity timer.
- The client counterpart and its tests live in `libs/shared-angular/src/lib/service-worker`; update both sides when changing messages or lifecycle behavior.

Run `bunx nx run public:test-workbox` and `bunx nx build public` from the repository root. For client changes, also run the corresponding public unit tests and recovery-dialog stories. Offline E2E is in `apps/public-e2e/src`; the Playwright config defines dedicated `service-worker-*` projects that allow workers while ordinary browser projects block them. Use an existing production build/server for those checks.

See [offline and service-worker documentation](../../../docs/docs-frontend/C%C3%B3digo/Off-line%20e%20service%20worker.md) for the wider behavior.
