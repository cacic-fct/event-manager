# Content review

This module coordinates lecturer profile self-edits and lecturer-submitted materials for subscribers. The admin queue is `/admin/content-reviews`.

## Publication rules

| Change | While pending | Approval | Rejection |
| --- | --- | --- | --- |
| Lecturer profile | The edited profile is already public | Confirms selected changes | Restores selected previous values; rejecting profile creation removes it |
| Subscriber materials | Published materials stay unchanged; the proposal is staged | Applies selected changes to published materials | Discards selected proposals |

Editors with `Permission.Person.Update` or the relevant `Permission.Event.Update` bypass review for that resource. Dedicated `Permission.LecturerProfile.Review` and `Permission.EventMaterials.Review` allow review without granting general editing access. Inspect `reviewPermission` in [the resolver](content-review.resolver.ts) for fallback permissions and event context.

## Consistency rules

- Submissions and decisions lock the same person/event row inside the transaction. Keep the locks, revision check, content update and audit record together.
- Decisions carry the review ID, current revision and unique selected keys. Reject stale revisions and keys that no longer exist. Remaining changes stay pending with a new revision.
- Material identity is stable across URL edits. Legacy links derive identity from their URL; use [the material helpers](material-review.ts) and [change helpers](content-review-changes.ts) rather than treating every URL edit as an unrelated link.
- Validate the resulting published material set after a partial approval. A replacement can reuse a URL, so one selected change may conflict while approving the related changes together succeeds.
- Material approval and submission respect backend frozen-resource policy. The editor's `editingFrozen` response is caller-specific; keep saved links readable while editing is blocked.
- Audit decisions identify the reviewer, selected keys, review ID and approved/rejected values. Publish realtime invalidation after the transaction succeeds. Preserve hidden-photo filtering in [the presenter](content-review-presenter.ts).

## Related code and validation

- Profile submission: [lecturer-profiles.resolver.ts](../people/lecturer-profiles.resolver.ts).
- Materials submission: [event-preparation.resolver.ts](../events/event-preparation.resolver.ts).
- Admin page and stories: [content-reviews](../../../../admin/src/app/content-reviews).
- Backend regression coverage: [resolver tests](content-review.resolver.spec.ts), [GraphQL integration tests](content-review-graphql.integration.spec.ts) and the submission resolvers' suites.
- Browser regression coverage: [admin E2E](../../../../admin-e2e/src/content-reviews.spec.ts), including confirmation/cancellation and updated review revisions.

Run `bunx nx test backend --runInBand --testPathPatterns='content-review|lecturer-profiles|event-preparation'` from the repository root and lint the affected projects. Update admin stories when changing queue states or decisions.

The schema is in `apps/backend/prisma/schema/content-review.prisma`. Deployment requires the corresponding migration and a published, Critical Novu workflow named `content-review-queued`; its identifier is also protected in shared notification preferences. Verify those external states explicitly. The queue summary separator is ` - `.
