# Shared notifications UI

This library supplies the Novu inbox, unread badge, push permission UI and notification preferences used by both Angular apps.

## Contracts to preserve

- [novu-inbox.component.ts](src/lib/novu-inbox.component.ts) paginates with the last notification's **ID**. A timestamp used as the `after` cursor causes Novu validation failures.
- `appBasePath` distinguishes `/app` from `/admin`. Root-relative links without a mount target the public app; explicit mounted links preserve their destination, query and hash. Same-app links use Angular routing, and cross-app links use the browser. Preserve URL validation and rejection of protocol-relative links.
- `markReadOnOpen` defaults to true. Opening the active inbox access marks notifications read; keep session/access guards so async work does not leak into another session. Preserve explicit mark-unread behavior.
- [notification-preferences.ts](src/lib/notification-preferences.ts) protects required workflow identifiers and respects Novu's `workflow.critical`. Keep it aligned with [the backend workflow catalog](../../apps/backend/src/app/notifications/novu-workflow-identifiers.ts). `content-review-queued` is a required workflow.
- Local preference filtering does not publish or configure Novu workflows. Required workflows also need Critical configuration in the external service; see [notification operations](../../docs/docs-backend/Notifica%C3%A7%C3%B5es.md).

## Consumers and checks

The inbox tests run under [the public app suite](../../apps/public/src/app/notifications/novu-inbox.component.spec.ts); the admin wrapper has [its own tests](../../apps/admin/src/app/notifications/notifications-page.component.spec.ts). This library has no standalone Vitest config. The pure preference-helper suite can run from the repository root with `bunx vitest run libs/shared-notifications-angular/src/lib/notification-preferences.spec.ts` using the root config.

Run relevant public/admin tests and `bunx nx lint shared-notifications-angular`. Build both consuming Storybooks for shared UI changes; stories are discovered from this library by the app catalogs. Cover pagination, mounted links, unread actions and narrow-screen layout. The public consumer reserves bottom-toolbar space with `--app-bottom-toolbar-height`.

Mocked SDK/HTTP and Storybook checks establish local behavior. A delivery claim requires separate verification against the configured Novu environment and a synthetic subscriber.
