import type { ContentReview } from '@prisma/client';
import { readChanges, type ContentChange } from './content-review-changes';
import type { ContentReviewGroup, ContentReviewItem } from './content-review.models';

function displayValue(value: string | null | { publishGoogleUserPicture: boolean; googleUserPicture: string | null }) {
  if (typeof value === 'object' && value) {
    return value.publishGoogleUserPicture ? (value.googleUserPicture ?? 'Visível quando disponível') : 'Oculta';
  }
  return value;
}

function presentItem(change: ContentChange, materialBlocks: ReadonlyMap<string, boolean>): ContentReviewItem {
  const { key, authorName } = change;
  switch (change.kind) {
    case 'material':
      return {
        key,
        authorName,
        authorEditingBlocked: change.authorPersonId ? materialBlocks.get(change.authorPersonId) : undefined,
        beforeMaterial: change.before,
        afterMaterial: change.after,
        fields: [],
      };
    case 'profileCreation':
      return {
        key,
        authorName,
        fields: Object.entries(change.after)
          .filter(([, value]) => value != null)
          .map(([key, value]) => ({ key, after: displayValue(value) })),
      };
    case 'profileField':
      return {
        key,
        authorName,
        fields: [{ key, before: displayValue(change.before), after: displayValue(change.after) }],
      };
  }
}

export function presentReview(
  review: ContentReview & {
    profile: { person: { name: string }; selfEditingBlocked: boolean } | null;
    event: { name: string } | null;
  },
  canManagePeople: boolean,
  materialBlocks: ReadonlyMap<string, boolean>,
): ContentReviewGroup {
  return {
    id: review.id,
    revision: review.revision,
    updatedAt: review.updatedAt,
    isProfile: !!review.personId,
    targetName: review.profile?.person.name ?? review.event?.name ?? '',
    profileEditingBlocked: canManagePeople ? review.profile?.selfEditingBlocked : undefined,
    items: readChanges(review).map((change) => presentItem(change, materialBlocks)),
  };
}
