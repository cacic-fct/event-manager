# shared-permissions

Shared permission catalog for CACiC Event Manager.

This package is the source of truth for permission names used by the backend and the Angular admin workspace. Do not scatter raw permission strings through resolvers, services, templates, or stories when the permission belongs to Event Manager authorization.

## What lives here

- `Permission`: typed permission constants in the `resource#action` format.
- `EVENT_MANAGER_PERMISSION_CATALOG`: the complete list of valid Event Manager permissions.
- `EventManagerKeycloakRole`: coarse Keycloak roles used by the Event Manager authorization layer.
- `EventManagerPermissionGrantScope`: grant scopes supported by the DB-backed permission system.
- `WorkspacePermissionTab`: stable tab identifiers used to connect admin navigation to tab permission requirements.
- `WORKSPACE_TAB_PERMISSIONS`: permission requirements used by admin workspace tabs.
- `WORKSPACE_PERMISSION_EVALUATION_SET`: complete catalog alias used by the frontend when asking the backend to evaluate the current user.
- `EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSIONS`: permissions that cannot be scoped to one event, event group, or major event.
- `EVENT_MANAGER_PERMISSION_SCOPE_COMPATIBILITY`: resource-to-scope compatibility, including the sports mapping from tournament to major event, category to event group, and match to event.
- Permission labels, icons, included-data descriptions, presets, role templates, system roles and permission dependencies used by the role/group management UI.

## Authorization model

Keycloak only decides coarse access through client roles on the Event Manager client:

- `access` lets a user enter Event Manager administration.
- `super-admin` bypasses Event Manager permission grants.
- M2M roles belong to service-account integrations and are separate from human admin grants.

Do not model human admin permissions as Keycloak Authorization Services resources, scopes, or policies.

Business permissions come from Event Manager roles stored in the application database. A role contains catalog permissions and can inherit other roles. Assignments attach roles to people or permission groups; groups have their own person memberships. Each assignment has one or more scopes:

- global, event, major event or event group;
- a target when the scope is not global;
- optional `validFrom` and `validUntil` dates, independently of the assignment and group-membership windows.

Effective access is calculated by `apps/backend/src/app/authorization/effective-role-scopes.ts`. It combines active direct/group assignments, inherited permissions and hard dependencies for exactly one active person linked to the account. Archived relations and inactive validity windows do not grant access. The policy does not query the old direct-permission-grant model.

System-role permissions and dependency rules live in `permission-role-policy.ts`. The external `super-admin` role is not assignable through Event Manager. Permission names that contain `Grant`, and scope compatibility helpers, remain part of the shared vocabulary; they do not imply direct grant persistence.

The backend policy layer is still the security boundary. Frontend checks only decide which tabs, buttons, and diagnostics are shown.

Sports reuse the existing authorization hierarchy instead of adding parallel scope columns:

- a sports tournament is backed by a major event;
- a sports category is backed by an event group;
- a sports match is backed by an event.

Read permissions may flow down to a nested target so operators can see the minimum parent context needed for a category or match. Tournament and tournament-wide team mutations remain global or major-event scoped. Category and registration mutations may be event-group scoped, while match, official, and score operations may also be event scoped. Creation permissions stop at the nearest existing parent because the new target does not exist yet.

## Maintenance rules

When adding or changing a permission:

1. Add the constant to `Permission`.
2. Add it to `EVENT_MANAGER_PERMISSION_CATALOG`.
3. Add labels/icons through the helper functions when the permission appears in the UI.
4. Add included-data metadata when the permission exposes limited personal or operational data.
5. Add it to workspace tab requirements or presets only when the UI needs it.
6. Add it to `EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSIONS` if a scoped grant would be misleading or unsafe.
7. Use `RequirePermissions(Permission.X.Y)` in backend handlers instead of string literals.
8. Review system roles, hard/contextual permission dependencies and role templates for the new action.
9. Add or update backend policy tests and UI stories for new behavior. Audit new state-changing operations at their backend mutation boundary.

See [agent instructions](AGENTS.md) for the implementation checklist and [backend authorization instructions](../../apps/backend/src/app/authorization/AGENTS.md) for target resolution, scoped collections and delegation.

## Building

Run `bunx nx build shared-permissions` to build the library.
