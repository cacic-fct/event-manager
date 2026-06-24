# @cacic-fct/event-manager-public-contracts

Framework-agnostic TypeScript contracts and GraphQL snippets for CACiC Event
Manager public queries.

This package is for projects that read public Event Manager data without
depending on Angular, NestJS, Prisma, or internal monorepo libraries.

## Install

Install from the public npm registry with Bun:

```bash
bun add @cacic-fct/event-manager-public-contracts
```

## Use

```ts
import {
  PUBLIC_CALENDAR_EVENTS_QUERY,
  type PublicCalendarEventsQuery,
  type PublicCalendarEventsQueryVariables,
} from '@cacic-fct/event-manager-public-contracts';

async function loadCalendarEvents(endpoint: string, variables: PublicCalendarEventsQueryVariables) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: PUBLIC_CALENDAR_EVENTS_QUERY,
      variables,
    }),
  });

  const payload = (await response.json()) as { data?: PublicCalendarEventsQuery };
  return payload.data?.publicCalendarEvents ?? [];
}
```

Types are also available through modular subpath exports:

```ts
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts/types/events';
import { PUBLIC_EVENT_PAGE_QUERY } from '@cacic-fct/event-manager-public-contracts/graphql/queries';
```

## Building

Run `bunx nx build event-manager-public-contracts` to build the library.

## Publishing

This package has an independent release cycle. Bump this package's own
`version` before merging changes that should be published.

Run `bun run publish:event-manager-public-contracts` from the repository root
when publishing manually. The CI workflow publishes this package to npm through
Trusted Publishing.
