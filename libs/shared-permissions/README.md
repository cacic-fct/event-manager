# shared-permissions

Shared permission catalog for CACiC Event Manager.

This package is the source of truth for permission names used by the backend and the Angular admin workspace. Do not scatter raw permission strings through resolvers, services, templates, or stories when the permission belongs to Event Manager authorization.

## What lives here

- `Permission`: typed permission constants in the `resource#action` format.
- `EVENT_MANAGER_PERMISSION_CATALOG`: the complete list of valid Event Manager permissions.
- `EventManagerKeycloakRole`: coarse Keycloak roles used by the Event Manager authorization layer.
- `EventManagerPermissionGrantScope`: grant scopes supported by the DB-backed permission system.
- `WORKSPACE_TAB_PERMISSIONS`: permission requirements used by admin workspace tabs.
- `WORKSPACE_PERMISSION_EVALUATION_SET`: permissions the frontend asks the backend to evaluate for the current user.
- `EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSIONS`: permissions that cannot be scoped to one event, event group, or major event.
- Permission labels, icons, included-data descriptions, and presets used by the grant-management UI.

## Authorization model

Keycloak only decides coarse access:

- `event-manager#access` lets a user enter Event Manager administration.
- `event-manager#super-admin` bypasses Event Manager permission grants.
- M2M roles belong to service-account integrations and are separate from human admin grants.

Business permissions are Event Manager grants stored in the application database. A grant has:

- a permission from `EVENT_MANAGER_PERMISSION_CATALOG`;
- a scope: global, event, major event, or event group;
- an optional target for scoped grants;
- optional `validFrom` and `validUntil` dates.

The backend policy layer is still the security boundary. Frontend checks only decide which tabs, buttons, and diagnostics are shown.

## Maintenance rules

When adding or changing a permission:

1. Add the constant to `Permission`.
2. Add it to `EVENT_MANAGER_PERMISSION_CATALOG`.
3. Add labels/icons through the helper functions when the permission appears in the UI.
4. Add included-data metadata when the permission exposes limited personal or operational data.
5. Add it to workspace tab requirements or presets only when the UI needs it.
6. Add it to `EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSIONS` if a scoped grant would be misleading or unsafe.
7. Use `RequirePermissions(Permission.X.Y)` in backend handlers instead of string literals.
8. Add or update backend policy tests and UI stories for new behavior.

## Building

Run `nx build shared-permissions` to build the library.
