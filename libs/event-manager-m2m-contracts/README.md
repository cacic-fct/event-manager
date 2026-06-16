# @cacic-fct/event-manager-m2m-contracts

Framework-agnostic contracts for CACiC Event Manager machine-to-machine APIs.

The package exports Event Manager M2M role names, endpoint helpers, and
request/response DTO types used by CACiC Voto.

## Install

Configure GitHub Packages for the CACiC FCT scope:

```ini
@cacic-fct:registry=https://npm.pkg.github.com
```

Then install with Bun:

```bash
bun add @cacic-fct/event-manager-m2m-contracts
```

## Use

```ts
import {
  EVENT_MANAGER_M2M_VOTING_ROLES,
  EVENT_MANAGER_M2M_VOTING_ROUTES,
  type EventManagerVotingAttendanceCheckResponse,
} from '@cacic-fct/event-manager-m2m-contracts';

const route = EVENT_MANAGER_M2M_VOTING_ROUTES.attendanceCheck('event-id');
const requiredRole = EVENT_MANAGER_M2M_VOTING_ROLES.READ;
```

## Building

Run `bunx nx build event-manager-m2m-contracts` to build the library.

## Publishing

This package has an independent release cycle. Bump this package's own
`version` before merging changes that should be published.

Run `bun run publish:event-manager-m2m-contracts` from the repository root when
publishing manually.
