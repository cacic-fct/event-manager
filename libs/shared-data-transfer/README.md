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

For a key-only preview, keep the returned `allocation.token` and submit it with the unchanged source file to `POST /api/admin/data-transfer/apply`. Allocations are bound to the authenticated actor and the canonical file, expire after 15 minutes, and are held in memory; a server restart invalidates pending allocations. The apply response contains a normalized document with generated or matched IDs, no local keys, and only normalized person IDs. Save that document before using it as a later update file.

Subscriptions can match an existing target/person pair even when the input uses a local key. Attendance has a compound database key; its portable ID is derived from the resolved event and person IDs. The preview reports these actual identities instead of an unused generated ID.

## Resource kinds

The version 1 schema has 20 resource kinds:

- Event tree and price setup: `major-event`, `group`, `event`, `major-event-price`, `price-tier`, `place-preset`.
- Event configuration: `event-form`, `form-link`, `certificate-config`, `ticket-config`, `ticket-price-option`.
- Sports setup: `sports-tournament`, `sports-category`, `sports-venue`, `sports-stage`, `sports-match`.
- Participation: `event-subscription`, `group-subscription`, `major-event-subscription`, `event-attendance`.

Only fields listed for a resource in `TransferDocumentSchema` are accepted. Publication state, payment receipts, online attendance codes, invitations, private participant records, match results, scores, and operational sports actions are outside this format. Person references in participation resources match existing people only; unresolved or ambiguous matches are reported as skipped rows, and imports never create people.

## Export selection

`POST /api/admin/data-transfer/export` takes a target `{ "kind": "event" | "group" | "major-event", "id": "..." }` and independent booleans:

- `includeDescendants` includes child groups and events for group or major-event targets.
- `includeConfiguration` includes supported forms, certificates, tickets, prices, and sports setup attached to the selected tree.
- `includeSubscriptions` includes subscriptions on the selected target itself.
- `includeAttendances` includes attendance only when the selected target is an event.
- `includeChildSubscriptions` independently includes subscriptions for descendant events and groups.
- `includeChildAttendances` independently includes attendance for descendant events.

All participation flags default to `false`. Export omits rows the actor cannot read and returns safe omission issues. No participant or attendance data is included unless its corresponding option is selected.

## Editing and preview

Omitted fields preserve the stored value. `null` clears a field only when its schema permits null; omitted fields and `null` have different meanings. A list supplied in a resource replaces that list or selection. Child resources are upserted by ID; missing resources are never treated as deletions.

Existing records cannot be reparented in version 1. New resources must supply the fields and dates required by their domain service. A sports match must exist before importing attendance for it, so create the match first and import its attendance in a later file. A price-tier rename that conflicts with explicitly imported dependent subscription or certificate labels must be split into separate imports: rename the tier, then update those labels.

`POST /api/admin/data-transfer/preview` validates the entire file and returns field-by-field changes, row actions (`create`, `update`, `unchanged`, or `skip`), safe reasons for blocked rows, a `planHash`, and any key allocation. The plan checks current authorization, frozen resources, domain invariants, dependencies, and optimistic revisions. The server recomputes the plan inside the apply transaction; a changed file, permission, or revision makes the hash stale.

`POST /api/admin/data-transfer/apply` requires the reviewed `planHash` and an explicit `allowPartial` value. With `allowPartial: false`, any blocked row rejects the whole apply. With `true`, ready rows can apply, while a blocked parent also blocks dependent rows. Unrelated ready branches can proceed. Aggregate rules are checked again against the executable plan and after its writes: a price table cannot rely on a skipped new tier. Group certificate cascades include authorized child names, values, and revisions in the preview. Explicit child updates are normalized to the parent policy and written only once. Reversed subscription and online-attendance windows are rejected, including when one bound is omitted. There is no generic delete operation.

If an apply commits but its response is lost, retry the exact request as the same organizer with the same file, scope, `planHash`, `allowPartial`, and allocation token. The server returns the previously committed normalized result without writing the resources again, even after a restart or allocation expiry. Changing any part of the request starts a new apply attempt; an undone batch cannot be replayed. Identical concurrent requests are serialized with a transaction advisory lock and recheck the committed result before resolving local keys. The UI retains the exact request after a network or server failure, protects its file/context, and provides a result verification action instead of requiring another preview. It warns before leaving while the outcome is unknown. A conclusive server rejection allows a fresh review. The audit record stores a request fingerprint and safe result summary, not the original file or allocation token.

## Permissions, history, and undo

Import and export require their corresponding `DataTransfer` gate plus the owning resource permissions in the current server-resolved event, group, major-event, or sports scope. Participation imports additionally require subscription or attendance permissions; sports attendance checks match read/operate rights when it would start check-in. A requested import scope narrows which target rows can be changed; file-supplied IDs do not grant access.

`GET /api/admin/data-transfer/history` lists recent authorized batch summaries. `POST /api/admin/data-transfer/undo` reverses an applied batch only for its importing actor or a superadmin, with `DataTransfer.Undo` and current permissions for every affected resource. Undo is atomic and is blocked if the schema changed or any affected row changed after the import. Search and realtime synchronization are recorded for retry after a restart.

## Limits and TypeScript API

Files are limited to 5 MiB, 500 resources, and 32 nested JSON levels. Unknown versions, resource kinds, fields, and unsafe object keys are rejected before any row is processed. Schema validation is local: clients use the schema returned by the backend and do not fetch or evaluate a schema embedded in the file.

The library exports the file-level `TransferDocument` and `TransferFileResource` types, the server-normalized `TransferResource` union, `ResourceOfKind<K>`, `TransferPreview`, `TransferResult`, `TransferExportRequest`, and `TransferApplyRequest`. Runtime contracts are `TransferDocumentSchema`, `TransferResourceSchema`, and `TRANSFER_RESOURCE_SCHEMAS`; use `parseTransferDocument`, `parseTransferJson`, or `validateTransferDocument` for runtime validation. `createTransferTemplate` provides a starter event tree. Type-level contract checks in `schema-contracts.type-test.ts` and backend contract tests verify that the allowlisted schemas stay aligned with their owning domain types and enums.

TypeBox supplies the runtime JSON Schema and inferred transfer types. Checked schema builders anchor allowlisted field names, field types, nullability, references, and enums to the existing TypeScript owner contracts. There is no separate hand-maintained transfer interface. Explicit conversion boundaries cover serialized dates and owner-validated JSON. New owner fields remain excluded until deliberately allowlisted. Negative compile tests verify that removing or changing an owner field invalidates its schema; CI runs these checks before the shared library tests.

## Verification

```sh
bunx nx test shared-data-transfer
bunx nx run backend:test-data-transfer-integration
bunx nx run-many --targets=lint --projects=backend,admin,shared-data-transfer,shared-permissions
```

The integration target uses isolated PGlite PostgreSQL fixtures to verify transaction rollback, restart recovery, exact-request replay, and guarded undo. It does not apply application migrations. CI also runs the real HttpClient/MSW browser flows and strict Storybook accessibility checks. Shared fixtures use relative dates and faker; test-only fixtures are exposed through `@cacic-fct/shared-data-transfer/testing` and are excluded from application bundles.
