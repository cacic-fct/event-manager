# CACiC event data transfer

This library defines the versioned JSON contract for exporting, reviewing, and importing event, sports, and participation data. The backend serves the matching JSON Schema at `GET /api/admin/data-transfer/schema`.

## Document and identity

Every file uses `format: "cacic-event-data"`, `version: 1`, and a `resources` array. Each resource has a `kind`, an editable `data` object, and either an existing `id` or a file-local `key`. Existing IDs select records to update; IDs are immutable and cannot move a record to a different parent. A key identifies a new record in this file, and the server allocates its database ID during preview.

Existing records use stable IDs:

```json
{
  "$schema": "urn:cacic:event-data:v1",
  "format": "cacic-event-data",
  "version": 1,
  "resources": [
    {
      "kind": "event",
      "id": "event-123",
      "data": { "name": "Updated title" }
    }
  ]
}
```

New resources can refer to one another by their bare key strings. The key is not prefixed with `#` or `$`:

```json
{
  "$schema": "urn:cacic:event-data:v1",
  "format": "cacic-event-data",
  "version": 1,
  "resources": [
    { "kind": "major-event", "key": "MAJOR-1", "data": { "name": "New series", "startDate": "2030-05-01T12:00:00.000Z", "endDate": "2030-05-01T18:00:00.000Z" } },
    { "kind": "group", "key": "GROUP-1", "data": { "name": "Talks", "majorEventId": "MAJOR-1" } },
    { "kind": "event", "key": "EVENT-1", "data": { "name": "Opening", "startDate": "2030-05-01T12:00:00.000Z", "endDate": "2030-05-01T13:00:00.000Z", "eventGroupId": "GROUP-1", "majorEventId": "MAJOR-1" } }
  ]
}
```

For a key-only preview, keep the returned `allocation.token` and submit it with the unchanged source file to `POST /api/admin/data-transfer/apply`. Allocations are bound to the authenticated actor and the canonical file, expire after 15 minutes, and are held in memory; a server restart invalidates pending allocations. The apply response contains a normalized document with generated or matched IDs, no local keys, and only normalized person IDs. Its fields are reread after all writes in the apply transaction, including domain normalization and defaults; exact-request retries return that same persisted document. Save that document before using it as a later update file.

Subscriptions can match an existing target/person pair even when the input uses a local key. Attendance has a compound database key; its portable ID is derived from the resolved event and person IDs. The preview reports these actual identities instead of an unused generated ID.

## Resource kinds

The version 1 schema has 22 resource kinds:

- Event tree and price setup: `major-event`, `group`, `event`, `major-event-price`, `price-tier`, `place-preset`.
- Event configuration: `event-form`, `form-link`, `certificate-config`, `ticket-config`, `ticket-price-option`.
- Sports setup: `sports-tournament`, `sports-category`, `sports-venue`, `sports-stage`, `sports-match`.
- Participation: `event-subscription`, `group-subscription`, `major-event-subscription`, `event-attendance`.
- Ticket rights and external payments: `event-ticket`, `ticket-purchase`.

Only fields listed for a resource in `TransferDocumentSchema` are accepted. Publication state, payment receipts, online attendance codes, invitations, private participant records, match results, scores, and operational sports actions are outside this format. Person references are crossed against all supplied identifiers using the CSV matching rules. Missing people and conflicting or ambiguous name matches require manual review. The preview returns `personPrompts`; submit `personDecisions` with each prompt key and a `create`, `merge`, or `skip` action, then review the complete plan again. Creation requires global `Person.Read` and `Person.Create`, a full name, and at least one enrollment number, document number, email, or complete E.164 international phone (or a Brazilian number with area code). A manual merge selects a server-provided candidate and requires global `Person.Read` and `Person.Update`; it preserves the primary email and adds the imported address using the existing secondary-email merge rules. Existing enrollment/document values must remain compatible. The server rejects identifier collisions across existing records and proposed person changes. Pending person choices block the entire apply, including partial imports. People and participation writes share the same serializable transaction, undo journal, and durable search outbox.

## Standalone purchases and issued tickets

A `ticket-purchase` imports a paid external purchase. Supply `eventId`, `person`, `amountCents`, and `purchasedAt`; `priceTierName` is optional historical payment text. The event must belong to a major event and have enabled ticket configuration, which can be supplied in the same file. The import creates an approved purchase and issues a `PURCHASE` ticket in the same transaction, with no main-event subscription, account, or receipt upload required. Historical purchases can precede the current date even when the event has ended. The purchase date must precede ticket expiration. This administrative flow requires ticket issue and receipt approval permissions and does not use the public checkout's subscription or audience requirements. Existing approved purchases match by event/person; pending/rejected purchases cannot be approved by JSON. Duplicate live or consumed rights are blocked. Purchase dates are immutable after import.

```json
{
  "format": "cacic-event-data",
  "version": 1,
  "resources": [{
    "kind": "ticket-purchase",
    "key": "DINNER-ANA",
    "data": {
      "eventId": "dinner-event",
      "person": { "name": "Ana Silva", "email": "ana@example.com" },
      "amountCents": 2500,
      "purchasedAt": "2026-10-01T18:00:00.000Z"
    }
  }]
}
```

An `event-ticket` transfers the issued right itself, independently of a payment record or subscription. Exported rights can be reimported using their stable IDs. New snapshots require `eventId`, `person` (or `null` for a deleted/anonymized holder), `source`, `status`, `issuedAt`, and `expiresAt`; consumed/revoked snapshots also require the matching timestamp. Existing source metadata and original holder are immutable. Changing a holder, including creating a transferred snapshot, requires ticket transfer management permission and no pending transfer. Ticket issue permission is always required; revoke permission is required only when creating a revoked ticket or transitioning to revoked. Do not import a purchase and a separate live ticket for the same event/person in one file; a purchase issues its own right.

Ticket exports use portable `originalHolder` references without source person IDs. Import resolves this reference to a destination person and, when `sourceKey` is omitted, derives subscription source keys from the destination event and original holder. A distinct original holder must already match one existing destination person. If `originalHolder` and `person` use the same reference, the current holder's reviewed creation also supplies the original identity. The current holder uses the same create/merge/skip review as subscriptions. Legacy `originalHolderPersonId` references remain supported for destination IDs; supplying both lineage fields is rejected. A transferred snapshot records a transfer history marker so subscription reconciliation cannot recreate the original entitlement.

Ticket exports contain issued rights, not financial purchase records, receipt objects, transfer requests, scanner credentials, or full operational history. Receipt storage metadata never enters the JSON contract. Imported external purchases use the existing expired/empty receipt representation, so no storage object is created or fetched.

## Export selection

`POST /api/admin/data-transfer/export` takes a target `{ "kind": "event" | "group" | "major-event", "id": "..." }` and independent booleans:

- `includeDescendants` includes child groups and events for group or major-event targets.
- `includeConfiguration` includes supported forms, certificates, tickets, prices, and sports setup attached to the selected tree.
- `includeSubscriptions` includes subscriptions on the selected target itself.
- `includeAttendances` includes attendance only when the selected target is an event.
- `includePublishingState` includes `publicationState`, `scheduledPublishAt`, `publishedAt`, and `unpublishedAt` for exported events and major events. It defaults to `false`; groups do not have their own publication state.
- `includeAudienceInvitations` includes `invitationPersonIds` for each exported event, group, and major event. It defaults to `false` and follows the selected tree (`includeDescendants`). No person profile or delivery metadata is exported.
- `includeTickets` independently includes all issued tickets for the selected event, or for events belonging to the selected group/major event. It defaults to `false` and requires ticket read permission in each event scope. Active, consumed, revoked, expired, manually issued, purchased, and transferred rights retain their persisted state, source, dates, and portable current/original holder references. Subscription source keys are rebuilt during import. Expiration remains derived from the stored expiration date; it is not a separate persisted status.
- `includeChildSubscriptions` independently includes subscriptions for descendant events and groups.
- `includeChildAttendances` independently includes attendance for descendant events.

All participation flags default to `false`. Export omits rows the actor cannot read and returns safe omission issues. No participant or attendance data is included unless its corresponding option is selected.

## Editing and preview

Omitted fields preserve the stored value. `null` clears a field only when its schema permits null; omitted fields and `null` have different meanings. A list supplied in a resource replaces that list or selection. Child resources are upserted by ID; missing resources are never treated as deletions.

Existing records cannot be reparented in version 1. New resources must supply the fields and dates required by their domain service. A sports match must exist before importing attendance for it, so create the match first and import its attendance in a later file. A price-tier rename that conflicts with explicitly imported dependent subscription or certificate labels must be split into separate imports: rename the tier, then update those labels.

`POST /api/admin/data-transfer/preview` validates the entire file and returns field-by-field changes, row actions (`create`, `update`, `unchanged`, or `skip`), safe reasons for blocked rows, a `planHash`, and any key allocation. The plan checks current authorization, frozen resources, domain invariants, dependencies, and optimistic revisions. The server recomputes the plan inside the apply transaction; a changed file, permission, or revision makes the hash stale.

`POST /api/admin/data-transfer/apply` requires the reviewed `planHash` and an explicit `allowPartial` value. With `allowPartial: false`, any blocked row rejects the whole apply. With `true`, ready rows can apply, while a blocked parent also blocks dependent rows. Unrelated ready branches can proceed. Aggregate rules are checked again against the executable plan and after its writes: a price table cannot rely on a skipped new tier. Group certificate cascades include authorized child names, values, and revisions in the preview. Explicit child updates are normalized to the parent policy and written only once. Reversed subscription and online-attendance windows are rejected, including when one bound is omitted. There is no generic delete operation.

If an apply commits but its response is lost, retry the exact request as the same organizer with the same file, scope, `personDecisions`, `planHash`, `allowPartial`, and allocation token. The server returns the previously committed normalized result without writing the resources again, even after a restart or allocation expiry. Changing any part of the request starts a new apply attempt; an undone batch cannot be replayed. Identical concurrent requests are serialized with a transaction advisory lock and recheck the committed result before resolving local keys. The UI retains the exact request after a network or server failure, protects its file/context, and provides a result verification action instead of requiring another preview. It warns before leaving while the outcome is unknown. A conclusive server rejection allows a fresh review. The audit record stores a request fingerprint and safe result summary, not the original file or allocation token.

## Permissions, history, and undo

Import and export require their corresponding `DataTransfer` gate plus the owning resource permissions in the current server-resolved event, group, major-event, or sports scope. Participation imports additionally require subscription or attendance permissions; sports attendance checks match read/operate rights when it would start check-in. A requested import scope narrows which target rows can be changed; file-supplied IDs do not grant access.

Place presets are global resources and require global place permissions. Unchanged place presets can accompany a scoped sports import as dependencies; creating or editing a place preset requires an unscoped import. Place changes and their undo are synchronized to search through the durable journal. New price tiers validate the final parent table even when the table itself is omitted from the file; a `SINGLE` table must retain exactly one tier.

`GET /api/admin/data-transfer/history` lists recent authorized batch summaries. `POST /api/admin/data-transfer/undo` reverses an applied batch only for its importing actor or a superadmin, with `DataTransfer.Undo` and current permissions for every affected resource. Undo is atomic and is blocked if the schema changed or any affected row changed after the import. Search and realtime synchronization are recorded for retry after a restart.

## Limits and TypeScript API

Files are limited to 5 MiB, 500 resources, and 32 nested JSON levels. Unknown versions, resource kinds, fields, and unsafe object keys are rejected before any row is processed. Schema validation is local: clients use the schema returned by the backend and do not fetch or evaluate a schema embedded in the file.

The library exports the file-level `TransferDocument` and `TransferFileResource` types, the server-normalized `TransferResource` union, `ResourceOfKind<K>`, `TransferPreview`, `TransferResult`, `TransferExportRequest`, and `TransferApplyRequest`. Runtime contracts are `TransferDocumentSchema`, `TransferResourceSchema`, and `TRANSFER_RESOURCE_SCHEMAS`; use `parseTransferDocument`, `parseTransferJson`, or `validateTransferDocument` for runtime validation. `createTransferTemplate` provides a starter event tree. Type-level contract checks in `schema-contracts.type-test.ts` and backend contract tests verify that the allowlisted schemas stay aligned with their owning domain types and enums.

TypeBox supplies the runtime JSON Schema and inferred transfer types. Checked schema builders anchor allowlisted field names, field types, nullability, references, and enums to the existing TypeScript owner contracts. There is no separate hand-maintained transfer interface. Explicit conversion boundaries cover serialized dates and owner-validated JSON. New owner fields remain excluded until deliberately allowlisted. Negative compile tests verify that removing or changing an owner field invalidates its schema; CI runs these checks before the shared library tests.

## Verification

```sh
bunx nx test shared-data-transfer
bunx jest --config apps/backend/jest.config.cts --runInBand --testPathPatterns=data-transfer
bunx nx run backend:test-data-transfer-integration
bunx nx run-many --targets=lint --projects=backend,admin,shared-data-transfer,shared-permissions
```

The integration target uses isolated PGlite PostgreSQL fixtures to verify transaction rollback, restart recovery, exact-request replay, and guarded undo. It does not apply application migrations. CI also runs the real HttpClient/MSW browser flows and strict Storybook accessibility checks. Shared fixtures use relative dates and faker; test-only fixtures are exposed through `@cacic-fct/shared-data-transfer/testing` and are excluded from application bundles.

The same integration target runs `transfer-http.e2e.spec.ts`: a disposable Nest HTTP application with the production transfer controller and authentication guard, real planning, person matching, ticket adapter, and journal. Identity validation, authorization decisions, frozen-resource decisions, and notification delivery are controlled boundaries. These journeys cover explicit person creation, partial approval, apply retries, stale previews, permission revocation, private history, ownership checks, and undo conflicts. Rejected writes and retries compare the entire fixture database to detect unintended changes.

The shared backend database fixture uses PostgreSQL transactions over test delegates with JSON rows. It verifies atomicity and journal behavior; it does not reproduce the generated Prisma client's relational constraints or concurrent multi-connection locking. The unit suite separately checks conditional-write races, duplicate ticket rights, immutable ticket lineage, pending transfers, lifecycle dates, and purchase approval. These suites supplement the PostgreSQL ticketing database tests (`bun run test:ticketing:database`) and browser journeys rather than replacing them.

For actual Prisma constraints and concurrency, run `bun run test:data-transfer:database` (or `bunx nx run backend:test-data-transfer-postgres`) with `DATA_TRANSFER_TEST_DATABASE_URL` pointing to an already migrated, loopback-hosted PostgreSQL database named exactly `fct_app_data_transfer_test`. Use PostGIS 18, as in CI. The runner rejects application database names, remote hosts, and query-string connection overrides; it never falls back to `DATABASE_URL`, provisions a server, or runs migrations. Missing configuration or schema causes a failure, rather than skipped tests. Run `bun run test:data-transfer:runner` to verify these connection guards.

Provisioning is explicit. After creating the disposable database and approving its migrations, apply the repository schema with `DATABASE_URL="$DATA_TRANSFER_TEST_DATABASE_URL" bunx prisma migrate deploy --config apps/backend/prisma.config.ts`. CI creates and migrates a separate database on its temporary PostGIS service before running the suite on trusted and forked PRs.

The PostgreSQL suite uses the generated Prisma client, real ticket issuance, and transactional realtime outboxes. It verifies partial holder uniqueness for active/consumed tickets, globally unique source keys, foreign keys, competing purchases and ticket imports, exact-request replay with explicit and allocated IDs, rollback of whole batches and person changes, and undo after later consumption, revocation, transfers, or new references. Separate clients and transaction rendezvous force import overlap; the exact-request test also observes the waiting PostgreSQL advisory lock. An undo/consumption race pauses the actual delete and verifies that committed consumption and history survive. Cleanup deletes only each fixture's rows; it never truncates shared tables.

## Publication and audience invitation imports

Publication fields use the existing event/major-event read and create/update permissions, frozen checks, preview, transaction, audit, and undo flow. Omitted fields preserve the destination values; new records remain drafts when publication is omitted. A state transition clears dates belonging to other states. Supply lifecycle timestamps to retain historical publication dates; `null` is accepted when that historical date is unknown. Scheduled publication requires a future `scheduledPublishAt`; imported schedules are enqueued by durable recovery after commit and after undo. Published or scheduled records must satisfy the same audience invitation requirements as the publication editor, including inherited audiences and attendance policy.

`invitationPersonIds` replaces the full invitation list. Omit it to preserve invitations or supply `[]` to remove them. IDs must identify active, unmerged people already present in the destination; invitation lists do not use participant create/merge review and cannot reference file-local resource keys. This supports backups and transfers between databases with shared person identities. Invitations remain independent of the audience mode and can also be used for invited-only attendance. Up to 1000 distinct person IDs are allowed per target. Changes refresh attendance and access data through the existing synchronization flow; invitation delivery follows the existing notification worker. Both new export options require only the selected records' existing read permissions.
