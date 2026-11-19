# Audience access instructions

Read the [backend guide](../../../AGENTS.md). Audience visibility, publication state, attendance eligibility and administrative permission scope are separate checks; satisfying one does not imply the others.

- Use the existing principal and where builders in [audience-context.ts](audience-context.ts), plus [EventAudienceService](event-audience.service.ts). Preserve parent event-group/major-event audience restrictions when filtering an event.
- The request principal lives in AsyncLocalStorage. [The interceptor](event-audience.interceptor.ts) subscribes inside the context so Observable work inherits it; do not return a lazy Observable created outside the intended context and assume propagation.
- `X-Event-Audience: public` on a public GraphQL operation explicitly selects anonymous content for shared offline caches. Do not accidentally personalize that cache because a session cookie exists.
- Personal-history exceptions use `IncludePastParticipation` only on appropriate read handlers. They must not widen catalog queries, new participation eligibility or mutations. Preserve ownership, past-date and participation constraints.
- `PrismaService` installs [the audience extension](audience-prisma.extension.ts). It follows owning foreign keys and rewrites supported queries/selections. Raw SQL and work outside request context need an explicit audience review; do not assume automatic filtering covers them.
- The extension uses generated relation metadata for cardinality/ownership. After schema relations change, run Prisma generation; never edit `audience-relations.generated.ts` by hand. Its generator lives in `tools/generate-audience-relations.mjs`.
- Background jobs have no request principal. Resolve the intended recipient/principal before sending private content; do not make restricted content public to simplify a worker.
- [Publication readiness](audience-publication.ts) checks invitation requirements, including parent access restrictions and inherited attendance eligibility. Use it for publish/schedule paths rather than checking the local audience enum alone.
- Validate counts, nested relations, search results, public SEO, previews, exports and caches as well as direct record reads. Filtering a top-level list alone can still leak private metadata through another path.

Add regression cases for anonymous/allowed/denied principals, restrictive parents, nested owning relations and the limited history exception. Run relevant audience, authorization and publication suites plus backend lint.
