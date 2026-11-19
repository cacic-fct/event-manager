# “Minhas participações”

This page combines subscriptions, interests, attendance, lecturer responsibilities and certificate actions. A blank feed is not always an empty result: session initialization, connectivity, request completion and cache ownership are independent inputs.

## State and caching

- [list/attendances.ts](list/attendances.ts) derives the feed request from the user, session readiness, online status and cache revision. Keep those dependencies reactive so the first uncached load and reconnect trigger a request.
- [list/attendance-feed-cache.service.ts](list/attendance-feed-cache.service.ts) resets its memory cache when the authenticated account changes. It checks the account and revision before storing asynchronous results; preserve these checks against late responses.
- Preserve the last successful feed during refresh for the same account. A different account must not inherit the prior account's displayed feed.
- The cache currently has a two-minute TTL, one retry for selected transient HTTP failures, and a 60-second bound covering the entire request including retry. Keep a recoverable error for empty completion or a stalled first load.
- IndexedDB persistence is asynchronous and must not delay the online result. Offline snapshots are loaded through the existing public data-access layer; preserve its account ownership checks.
- Realtime user/catalog invalidations advance the cache revision. Manual retry invalidates failed state; do not bypass this mechanism with an unrelated loading flag.

## Presentation and related flows

Use the shared feed model and date helpers in `libs/shared-utils`. Missing/invalid dates display “Datas a confirmar” instead of throwing. Avoid empty participation headings. Keep button accessible names aligned with visible Portuguese text.

Certificate selection, archive cooldowns and downloads are separate from feed loading. Account changes also reset certificate selection and cooldown state. Organizer material editing under [organizer-info](organizer-info) uses the shared preparation editor and backend frozen-resource/review rules; read [the review guide](../../../../../backend/src/app/content-review/README.md) before changing publication behavior.

## Regression coverage

- [list/attendances.spec.ts](list/attendances.spec.ts): first load, account/session transitions, refresh, retry, reconnect and invalid-date presentation.
- [attendances-api.service.spec.ts](attendances-api.service.spec.ts) and its coverage suite: API behavior and supplemental data.
- [list/attendances.stories.ts](list/attendances.stories.ts): visual and interaction states; reuse [story fixtures](list/attendances-story.fixtures.ts).

Run the relevant public unit tests, `bunx nx lint public`, and build the public Storybook when changing these components. Exercise empty, loading, error and offline states as well as populated results.
