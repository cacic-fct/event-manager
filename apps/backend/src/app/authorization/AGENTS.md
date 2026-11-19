# Authorization instructions

Read the [backend guide](../../../AGENTS.md) and [shared permission maintenance guide](../../../../../libs/shared-permissions/AGENTS.md). The authority is current policy code, not historical direct-grant documentation.

## Effective permission model

- Keycloak supplies human `access` and `super-admin`. M2M roles/audience validation are a separate integration boundary. Do not create Keycloak business roles or Authorization Services policies for individual Event Manager permissions.
- [AuthorizationPolicyService](authorization-policy.service.ts) delegates effective permission lookup to [effective-role-scopes.ts](effective-role-scopes.ts). Roles can be assigned directly to a person or through a permission group; roles can inherit parent roles. There is no active direct-permission-grant lookup in that evaluator.
- The evaluator requires exactly one active person linked to the account. Preserve fail-closed behavior for missing/ambiguous links. Roles, assignments, groups, memberships, assignment scopes and validity windows determine active access; do not infer access from a role name alone.
- System role definitions and hard permission dependencies come from `libs/shared-permissions`. Group membership, assignment and scope windows are independent; `validFrom` is inclusive and `validUntil` exclusive.
- Scope compatibility and global-only rules belong to the shared catalog. Sports targets reuse major-event/event-group/event scopes through `sports-authorization-target.service.ts`; do not add a parallel scope model.

## Handlers and target resolution

- Use typed `RequirePermissions(Permission.X.Y)` for administrative handlers. Resolve the actual resource through `AuthorizationResourceContext`/`buildResourceContext`; IDs for forms, receipts, certificates, draws or sports resources require their owning target lookup.
- A generic `id` is interpreted using the required resource. For new input shapes or resource types, add target-resolution and cross-scope denial tests rather than assuming the guard can infer ownership.
- Dynamic create/update operations may authorize in the service after loading the current record. For example, permission-role saves select Create versus Update in `PermissionManagementService`. Empty permission metadata is not evidence that such a service is unprotected; preserve its explicit checks.
- `assertPermissions` also checks the current audience context. Super-admin bypass of permission grants does not justify removing audience/frozen/domain policy calls from the operation.
- Public self-service handlers still require authentication/ownership and eligibility checks even when they do not require an administrative permission.

## Scoped collections and bulk work

- `AllowScopedCollectionPermissions` allows entry to a collection when no single target is available. `RequireCollectionPermissions` also avoids interpreting nested row IDs as one shared scope. Neither filters rows for the service.
- Use the policy's `accessibleEventTargets`, `accessibleEventGroupIds` or `accessibleMajorEventIds` where appropriate and apply the result to the database query. In those helpers, `null` means unrestricted by permission scope; empty sets mean no scoped access. Audience, publication and soft-delete filters still apply.
- Counts, pagination totals, aggregates, exports, nested GraphQL fields and bulk mutations must obey the same scope boundary as individual rows. A frontend tab evaluation is not authorization for each record.
- Validate every affected target in bulk mutations. Do not authorize a mixed-target request using only its first row or a caller-supplied parent ID.

## Changing roles/groups

- Use [permission-management.service.ts](permission-management.service.ts), preserving optimistic versions, serializable graph transactions, inheritance-cycle checks, hard/context dependencies, compatible scopes and delegation checks for descendants/assignments.
- `super-admin` is external and not assignable here. System-role permissions are defined in code. Do not widen the actor's authority merely to make a save succeed.
- Archiving a custom role archives its active assignments and incoming inheritance links. Archiving a group archives its memberships. Preserve archive reasons and audit records; these operations affect effective access immediately.
- Test expired/future membership, inherited permissions, wrong scopes, global-only permissions, stale versions, forbidden delegation and rollback. Use real PostgreSQL for graph/locking guarantees when they change.

Run relevant backend authorization/guard/resolver suites and lint. When adding a permission, also follow the shared catalog checklist and update admin stories that explain included data or unavailable actions.
