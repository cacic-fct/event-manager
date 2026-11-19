# Permission catalog and role policy

Read the [library guide](../AGENTS.md). Runtime evaluation and administrative writes live in [backend authorization](../../apps/backend/src/app/authorization/AGENTS.md); this library owns the shared vocabulary and policy metadata.

When adding/changing a permission:

1. Add the typed constant in `src/lib/permission-types.ts` and catalog entry in `permission-catalog.ts`. Keep `resource#action` names stable; do not scatter raw strings through handlers/templates.
2. Update labels/icons and `permission-included-data.ts` when the action exposes personal or sensitive operational data. Describe the minimum context a user will be able to see.
3. Review global-only and scope compatibility rules. The same scope enum is used by assignments and backend target resolution; sports reuse the event hierarchy.
4. Review `permission-role-policy.ts`: hard dependencies, contextual dependencies and system roles. Hard dependencies expand effective access; contextual dependencies require enough accompanying access for the workflow. Do not add a read dependency without considering the additional data it exposes.
5. Update presets/templates and `workspace-permissions.ts` only where the UI needs the action. `super-admin` remains external and unassignable; system-role authority is defined here, not editable database rows.
6. Protect the backend operation, resolve its real target and add denial tests. Update admin permission evaluation, explanations and stories where relevant.
7. Audit the new state-changing operation through the backend audit service. Permission metadata alone does not add an audit record.

Keep new contracts independent of Angular/NestJS. Run the library's existing tests/lint and the affected backend policy suites; build consuming stories for permission-UI changes. [README.md](README.md) explains the current model for human developers.
