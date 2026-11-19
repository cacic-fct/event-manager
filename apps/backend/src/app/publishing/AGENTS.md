# Publication lifecycle instructions

Read the [backend mutation workflow](../../../AGENTS.md) and [audience rules](../audiences/AGENTS.md). Publication is a lifecycle transition, not a direct update of a visibility field.

- Use the existing target/transition/state-writer services so authorization, frozen-resource policy, tree consistency, preview access and audience readiness remain aligned.
- Preserve the distinction between content editing and publication actions. [publishing-audit.ts](publishing-audit.ts) separates bookkeeping from content snapshots and marks dedicated lifecycle audit entries; do not squash publication into an unrelated edit record.
- Record the state transition and its audit in the database transaction. Search/realtime synchronization and delayed-job enqueue happen after commit. If enqueue fails, report the committed state accurately and preserve reconciliation recovery.
- Scheduling validates the intended time and parent/child constraints. Delayed jobs include the schedule timestamp so a reschedule gets a fresh identity; workers must recheck persisted state before applying an old job.
- Preserve startup recovery and periodic reconciliation in [the jobs service](publishing-jobs.service.ts); Redis delivery alone is not durable publication state.
- JSON import/export shares these policies through the data-transfer layer. Publication/invitation export is opt-in; omitted import fields preserve existing values, while new records default to draft if publication state is omitted. Invitation imports replace the full list. Keep import audit/journal/undo support consistent.
- Preview URLs/tokens, public projections, search and offline caches must not bypass private audience or draft visibility. Do not infer that a published child is visible when a parent restricts it.
- Bound maintenance concurrency and pagination; use `queues/bullmq-job-id.ts` for new queue IDs and the human maintenance schedule when changing recurring work.

Cover immediate/scheduled transitions, stale jobs, restricted parents, enqueue failure recovery and lifecycle audits. Run relevant publishing/audience/data-transfer suites and backend lint. Mocked queue success does not establish live scheduling or publication.
