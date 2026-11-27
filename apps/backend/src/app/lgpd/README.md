# LGPD maintenance

Event Manager supplies its domain data to Account Manager through internal M2M endpoints. This module owns Event Manager export, deletion and storage cleanup behavior; Account Manager has its own request lifecycle and retention rules.

## Export boundaries

Exports contain the data subject's personal data, rather than a dump of related event operations. [lgpd-selects.ts](lgpd-selects.ts) defines explicit Prisma selections; [lgpd-export-mappers.ts](lgpd-export-mappers.ts) also restricts the emitted records. Keep both layers narrow.

- Certificate records contain only `id`, `personId`, `issuedAt` and `deletedAt`. Do not add event names, dates, credits or rendered certificate snapshots.
- Attendance records omit collection coordinates, collector method and operational category/creator details.
- Receipt records omit object keys, OCR text, processing errors and validation logs; use the dedicated receipt handling for exported files.
- Prize-draw records omit operational weighting and source details. Offline attendance submissions, merge candidates and draw weight overrides are not export categories.
- MCP operation exports include the subject’s consent scope and allowed operations, plus command operation, state, decision timestamps and reviewer attribution. Never export command arguments, reviewed arguments, fingerprints or idempotency keys. These can contain other people’s personal or financial information.
- Preserve data-subject resolution across merged people. Do not expand relations containing other people's data merely because they are reachable from the subject.

Cover query selections and the final serialized records in [export tests](lgpd.service.export.spec.ts); selecting fewer fields alone is not sufficient when mocks or later mapping can reintroduce them.

## Deletion and recovery

[lgpd.service.ts](lgpd.service.ts) handles scheduled deletion, cancellation and hard deletion. Preserve request ownership markers so cancellation does not restore data deleted for another reason. Follow dependency ordering for foreign keys and the existing handling of merged people and offline submissions.

Scheduling deletion immediately deletes MCP delegations for every resolved merged user ID. Their proposals and command payloads are removed by cascading foreign keys. Cancellation does not recreate grants. Hard deletion also clears reviewer identity on commands belonging to other users. Expired operation delegations and their commands are retained for 90 days after expiry, then pruned in bounded batches without executing or retrying commands.

Collect private storage keys before removing database records. Use [the storage cleanup service](lgpd-storage-cleanup.service.ts) and [processor](lgpd-storage-cleanup.processor.ts) for retryable deletion; a failed storage delete must remain recoverable. [Audit anonymization](lgpd-audit-anonymization.ts) preserves the operational record while removing the subject's identifiers and updating search when enabled.

Read the broader [privacy guide](../../../../../docs/docs-backend/Privacidade%20e%20LGPD.md) for M2M, cookies and storage boundaries. The existing ticket-transfer visibility rule belongs to `tickets/ticket-transfer.service.ts`; changing LGPD exports does not authorize changing that rule.

Run `bunx nx test backend --runInBand --testPathPatterns=lgpd` and `bunx nx lint backend`. Select relevant export, cancellation, hard-delete, storage-retry and audit tests according to the change. Do not apply another service's retention period here without a requirement and evidence in the owning implementation.
