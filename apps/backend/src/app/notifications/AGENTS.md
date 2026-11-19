# Notification backend instructions

Read the [backend guide](../../../AGENTS.md). Domain writes and notification delivery are separate outcomes; preserve the owning service's retry/idempotency policy.

- Workflow identifiers are contracts in [novu-workflow-identifiers.ts](novu-workflow-identifiers.ts). Use the catalog rather than inventing identifiers at call sites. Update its tests and the shared UI contract when adding/changing workflows.
- Required workflows must also be published and marked Critical in the intended Novu environment. Keep `libs/shared-notifications-angular/src/lib/notification-preferences.ts` aligned. Local filtering or a successful mock does not configure the remote service.
- Preserve stable subscriber identity and transaction/job identifiers. Resolve recipients through existing authorization/audience helpers; selecting every user with a coarse admin role can expose restricted context or notify the wrong staff.
- Payloads contain only what is needed for the notice and a link to an authorized screen. Do not include form answers, documents, receipt contents, private storage links, tokens or unnecessary personal data.
- Redirects are relative application paths. Preserve explicit `/app` and `/admin` destinations; query/hash and URL validation are handled by [the shared inbox](../../../../../libs/shared-notifications-angular/README.md).
- Schedule delivery after the domain commit using the existing durable mechanism where present. Preserve retry/claim rollback behavior, stable Novu transaction IDs and manual retry limits. Do not copy one workflow's retry settings onto unrelated workflows.
- Automatic certificate reconciliation is intentionally silent. Do not inherit the last manual issuance's notification choice or create notices for legacy automatic runs.
- Failures of complementary delivery must not undo a committed business change or falsely report an uncommitted one. Keep configuration, timeout and recipient failures observable without logging sensitive payloads.
- Live delivery checks use a synthetic subscriber; avoid push to real users during validation. Verify environment, workflow publication, payload and delivered redirect independently of code tests.

For setup details, read [human notification documentation](../../../../../docs/docs-backend/Notifica%C3%A7%C3%B5es.md). Run relevant backend and shared preference tests, and build the consuming Storybooks for changes that affect inbox presentation/preferences.
