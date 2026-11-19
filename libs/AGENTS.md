# Shared libraries agent guide

The root [AGENTS.md](../AGENTS.md) applies here. Search for an existing library before generating another one with Nx. For Angular libraries, read [Angular conventions](../agent-guides/angular.md); the same component, forms, accessibility, SSR and Storybook rules apply outside the apps.

| Concern | Owning library |
| --- | --- |
| Permission names, role policy, scopes, labels and workspace tabs | [shared-permissions](shared-permissions/AGENTS.md) |
| Public API contracts and GraphQL operations | [event-manager-public-contracts](event-manager-public-contracts/README.md) |
| Admin API contracts | `event-manager-admin-contracts` |
| Service-account integration contracts | [event-manager-m2m-contracts](event-manager-m2m-contracts/README.md) |
| Material parsing and event-preparation domain rules | `shared-event-preparation` |
| Shared Angular material/instruction editors and fixtures | `shared-angular/src/lib/event-preparation` |
| Participation domain logic and feed presentation | `shared-event-participation`, `shared-utils` |
| Offline public storage | `public-indexed-db` |
| Public entity and participation fixtures | `event-manager-public-testing` |
| Inbox, push and notification preferences | [shared-notifications-angular](shared-notifications-angular/README.md) |
| Analytics event/property contracts | [shared-analytics](shared-analytics/README.md) |
| Ticketing and data-transfer rules | [shared-ticketing](shared-ticketing/README.md), [shared-data-transfer](shared-data-transfer/README.md) |

Use public exports and aliases in `tsconfig.base.json`. Keep cross-runtime contracts and domain logic free of Angular/NestJS/browser dependencies when both runtimes consume them. Nx dependency rules in the root `eslint.config.mjs` enforce scope boundaries; shared libraries depend on shared libraries.

Check each `project.json` and test config before running tests. Libraries use a mix of runners, and some shared Angular suites run through a consuming app. In particular, `shared-notifications-angular` has no standalone Vitest config: inbox regression tests live in the public app, and the admin wrapper has its own tests.

Shared stories are discovered through `tools/storybook-library-stories.mjs` and the app Storybook configs. Build the consuming catalogs when changing shared UI. Reuse exported testing entry points and fixtures instead of duplicating realistic data across apps.
