# Angular conventions for coding agents

Read this guide for both apps and Angular libraries. App-specific behavior belongs in each app's `AGENTS.md`.

## Components, state and forms

- Use standalone components. Do not write `standalone: true` or explicitly set `ChangeDetectionStrategy.OnPush`; these are defaults in the project's Angular version.
- Keep components small and focused. Prefer inline templates for small components; external template/style paths are relative to the component TS file.
- Use `input()` and `output()`. For two-way state, prefer `model()` and `[(prop)]` over a manually paired input/output.
- Use signals for local state, `computed()` for derivations and `linkedSignal()` when derived state must stay synchronized with its sources. Use `set`/`update`, not `mutate`; keep transformations pure.
- Prefer stable Signal Forms (`@angular/forms/signals`) for new forms. Otherwise use reactive forms rather than template-driven forms.
- Keep templates simple. Use `@if`, `@for`, `@switch`, class/style bindings and the async pipe where appropriate; do not use `*ngIf`, `*ngFor`, `*ngSwitch`, `ngClass` or `ngStyle`.
- Put host bindings/listeners in the decorator's `host` object, not `@HostBinding`/`@HostListener`. Do not assume globals such as `new Date()` exist in templates.
- Use `NgOptimizedImage` for static images; it does not support inline base64 images.
- Use `inject()` rather than constructor injection. New singleton services should use Angular's `@Service()` convention; keep services focused and root-scoped.
- Lazy-load feature routes. Reuse public library entry points and existing UI/API helpers.

## Material, accessibility and copy

- Use the existing Angular Material components and default styles. Avoid custom themes; support both light and dark modes.
- Meet WCAG AA, pass applicable Axe checks, preserve visible keyboard focus and return focus after dialogs/actions. Automated checks do not substitute for keyboard and assistive-technology checks.
- Keep accessible names consistent with visible text; put supplementary metadata in descriptions rather than repeating it in the name.
- UI copy is Brazilian Portuguese. Avoid `·`; use natural punctuation or line breaks. The content-review summary separator is ` - `.
- Cover narrow viewports, zoom, long text, absent permission, frozen resources and loading/error/empty states when relevant.

## SSR and deployment constraints

- Guard browser APIs with `isPlatformBrowser`; use `isPlatformServer` when appropriate. Evaluate the app's `app.routes.server.ts` render mode for every new or edited browser-dependent page.
- Do not share authenticated state across SSR requests. Preserve account ownership when caching asynchronous browser data.
- Production uses strict CSP. Preserve external-script allowlists, Trusted Types and existing nonce handling; do not solve browser errors by weakening CSP or adding inline scripts/styles. Use the existing Angular/SSR integrations.

## Stories and checks

- Evaluate new reusable components or components with multiple states/interactions for Storybook coverage. Use controls for meaningful inputs, faker/shared fixtures for synthetic data and MSW for HTTP behavior.
- When editing a component with stories, ensure the consuming Storybook builds and the stories reflect the final behavior. Shared stories are discovered by the app catalogs through `tools/storybook-library-stories.mjs`.
- Run `bunx nx lint <project>` and relevant unit tests. App tests use the Angular unit-test target's `--include` option, with globs relative to the project source root.
- Build a consuming catalog with `bunx nx build-storybook public --configuration=ci` or the `admin` equivalent. Browser checks against an existing catalog use `node tools/storybook-browser-tests.mjs --url=<storybook-url> --grep=<story-filter> --strict-a11y`.
- For browser flows, read [frontend E2E guidance](frontend-e2e.md). Do not start the app servers; use the already-running URLs.
