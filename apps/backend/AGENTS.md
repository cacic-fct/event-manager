# Backend agent guide

The root [AGENTS.md](../../AGENTS.md) applies here. The NestJS application lives in `src/app`; the API prefix is `/api`. Prefer GraphQL when appropriate. REST endpoints need Swagger descriptions and input/result examples. Keep modules focused and reuse shared contracts/parsers.

## Required workflow for domain operations

1. Authenticate the correct principal and enforce onboarding/M2M requirements through the existing guards. Public ownership checks are separate from administrative permissions.
2. Authorize the actual target with `RequirePermissions(Permission.X.Y)` and `AuthorizationPolicyService`. New IDs/input shapes must resolve to the right event/group/major event. Collection admission does not authorize every returned row.
3. Enforce audience visibility, publication rules, soft-delete markers, frozen-resource policy and domain eligibility. Administrative editing access alone does not replace those checks.
4. Validate revisions/current values and perform dependent writes under the owning transaction and locking strategy. Reuse `common/serializable-prisma-transaction.ts` when a serializable retry is needed.
5. **Audit new state-changing domain operations.** Record the actor, operation, entity, permission/target scope and meaningful before/after values with `AuditLogService.record(options, tx)` in the same transaction as the write. Include public self-service and system changes where they change auditable domain state. Avoid duplicate resolver/service records and preserve deliberate no-op/silent-job behavior.
6. Synchronize derived state after commit: search, cached counts, realtime invalidation, jobs and notifications as applicable. Reuse the module's existing recovery/outbox mechanism; a committed database write cannot be rolled back by a later network error.
7. Cover successful changes and denial/conflict/rollback paths in backend tests, including audit attribution. Update shared API contracts, frontend states and operational docs when they change.

## Policies to read before implementation

| Concern | Instructions |
| --- | --- |
| Effective roles, scopes, collection filtering and delegation | [Authorization](src/app/authorization/AGENTS.md), [permission catalog](../../libs/shared-permissions/AGENTS.md) |
| Audit records, grouping, search synchronization and reversal | [Audit logging](src/app/audit-log/AGENTS.md) |
| Audience filtering and personal-history exceptions | [Audiences](src/app/audiences/AGENTS.md) |
| Frozen resources and transaction retry | [Shared backend policies](src/app/common/AGENTS.md) |
| Schema generation and migrations | [Prisma](prisma/AGENTS.md) |
| Publication transitions and durable scheduling | [Publishing](src/app/publishing/AGENTS.md) |
| Workflow contracts, recipients and notification privacy | [Notifications](src/app/notifications/AGENTS.md) |

Current human authorization is role-based: `effective-role-scopes.ts` derives scopes from active roles assigned to people/groups. Keycloak supplies `access` and `super-admin`; do not recreate a direct-grant system or duplicate business permissions in Keycloak.

## Module guides

| Task | Owning guide or source |
| --- | --- |
| Lecturer profile and subscriber material review | [Content review](src/app/content-review/README.md) |
| Certificate issuance, protection and previews | [Certificates](src/app/certificate/README.md) |
| Personal-data export and deletion | [LGPD](src/app/lgpd/README.md) |
| MCP transport, operations and review | [MCP](src/app/mcp/AGENTS.md) |
| Umami aggregate reporting and permission | [Shared analytics](../../libs/shared-analytics/README.md) |
| Ticket transfer visibility | `src/app/tickets/ticket-transfer.service.ts`, especially `isWithinPostEventRetention` |

The ticket-transfer helper currently applies a 30-day post-event window to ignored incoming and canceled outgoing entries. Preserve its existing scope when changing privacy behavior; it is not a blanket retention rule for all transfers.

## Query design and validation

- Select only needed Prisma fields; preserve existing GraphQL-aware projection helpers and request-local batching. Avoid one query per row and broad nested includes for list/count endpoints.
- Bound pagination, reindexing and scheduled work. Preserve audience/scope filtering before counts and aggregation, not just after fetching rows. Measure performance claims rather than inferring them from smaller code.
- Backend unit and GraphQL integration suites use Jest, configured in `jest.config.mts`. Focus with `bunx nx test backend --runInBand --testPathPatterns=content-review`; choose the changed module's pattern.
- Dedicated data-transfer and subscription-counter integration targets are declared in `project.json`; the default suite deliberately excludes some database tests. Read their configs and database requirements before running them.
- See [backend E2E](../backend-e2e/AGENTS.md) for PGlite versus real PostgreSQL/Keycloak checks. Generate Prisma first whenever the schema changed; never apply migrations without confirmation.
- Run `bunx nx lint backend`. Keep unrelated failures separate from the results for changed code.
