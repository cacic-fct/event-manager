# Audit logging instructions

Read the [backend mutation workflow](../../../AGENTS.md). New state-changing domain operations need an audit trail, including non-CRUD decisions such as approval, rejection, publication, revocation, imports and permission changes.

## Recording an operation

- Use `AuditLogService.record(options, tx)` and await it inside the same Prisma transaction as the domain mutation. Pass the transaction client explicitly; writing the audit through the root client can leave a record for a rolled-back change.
- Populate the entity type/ID/label, `AuditLogOperation`, authenticated actor, permission and event/group/major-event scope. Use a system actor for automated work, not a fabricated human identity. See [record types](audit-log.types.ts) and `resolveActor` in [the service](audit-log.service.ts).
- Capture meaningful before/after domain values. Do not log secrets, tokens, private storage keys, entire request bodies or unrestricted personal-data snapshots. Use the existing domain snapshot helpers and shared field labels.
- Record once at the owning mutation boundary. Avoid a second record in a caller when a service already audits the operation. Preserve deliberate no-op handling and silent automatic certificate reconciliation.
- Ordinary records with no field difference are skipped. Use `force: true` when a meaningful operation such as a review decision needs a record even without changed published values; do not use it to hide incomplete snapshots.
- Updates normally squash within two minutes for the same compatible context. Use `squashWindowMs: 0` where decisions must remain distinct. Publication lifecycle metadata and batch imports have special grouping rules; preserve them rather than inferring behavior from the operation enum alone.

## Transaction, search and import behavior

- [Synchronization](audit-log.synchronization.ts) indexes committed audit data; transaction-scoped records are re-read after commit. Do not push uncommitted records directly to Typesense.
- Import transactions carry the internal `AUDIT_BATCH_TRANSACTION` capability. Their audit records remain separate and the durable batch outbox owns synchronization. Never accept that capability or batch authority from request JSON.
- Test attribution, permission/target scope, snapshots, no-op behavior and rollback when adding operations. Search failure must not create a misleading successful business mutation or discard the database audit trail.

## New entity types and reversal

- Review `prisma/schema`, [entity record access](audit-log.entity-records.ts), [revert configuration](audit-log.revert-config.ts), [field labels](audit-log.field-labels.ts) and [subject references](audit-log.subject-references.ts) when introducing an audited entity or new personal-data fields.
- Auditing an operation does not automatically make it reversible. Configure supported operations, selected snapshots, mutable fields, read/update/delete permissions and soft-delete behavior deliberately.
- Reversal must enforce current authorization and frozen-resource rules, detect changed state and preserve domain invariants. Keep [revert invariants](audit-log.revert-invariants.ts) and [derived-state synchronization](audit-log.reverted-entity-sync.ts) aligned with any newly supported entity.
- Update LGPD anonymization and export review when adding identifiers to actors, snapshots, metadata or changed fields.

## Retention and checks

Records expire five calendar years after `lastRecordedAt`, including grouped updates. Preserve the cutoff helper, batched database deletion and Typesense cleanup/reindex filtering. The current schedule lives in [the retention job](audit-log.retention-job.ts) and the human maintenance schedule; do not copy an old cron time from task history.

Run relevant `bunx nx test backend --runInBand --testPathPatterns=audit-log` suites and `bunx nx lint backend`. Add domain-operation tests as well as audit-service tests: a unit test of `record` cannot prove the caller uses the right transaction or actor.
