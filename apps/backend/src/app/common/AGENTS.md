# Shared backend policies

Read the [backend mutation workflow](../../../AGENTS.md). Reuse these helpers instead of copying their rules into a feature.

## Frozen resources

- `FrozenResourceService` is the backend authority. The cutoff currently uses two calendar months and relevant valid resource dates; do not replace it with a fixed-day approximation or only the edited row's creation date.
- Use the method for the actual resource and operation. Moving resources between parents requires checking the old/new parent relationships; `assertEventUpdateMutable` and create-target helpers already handle this distinction.
- Editing and deletion have separate override permissions (`Permission.Frozen.Update`/`Delete`) evaluated in resource context. Review/edit permissions do not automatically grant a freeze override.
- Inside a transaction, use `forTransaction(tx)` when checks must share the transaction's view. Preserve include-deleted behavior only for the restoration/reversal paths that need it.
- Expose caller-specific frozen/editable state for UI diagnostics while enforcing the same policy on writes. A read-only materials editor must still let people open already-saved links.

## Transactions and shared validation

- `runSerializablePrismaTransaction` retries recognized serialization/write conflicts with bounded backoff. This includes Prisma `P2034`, supported adapter conflicts and a `P2010` wrapping PostgreSQL `40001`; do not retry every raw-query or validation error.
- The callback may run more than once. Keep external sends, queue publication and irreversible storage changes outside it, or use the feature's durable outbox. Keep domain writes and audit records inside the transaction.
- Preserve pagination bounds, REST validation, Brazilian phone normalization and identity matching through their shared helpers. Do not introduce a second interpretation of public input in a resolver.

Test frozen boundaries with a controlled clock and transaction retries with the existing helper suites. Use real overlapping PostgreSQL sessions for concurrency claims; mocks establish retry selection, not database isolation.
