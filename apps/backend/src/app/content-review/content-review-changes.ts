import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ConflictException } from '@nestjs/common';
import type { EventMaterial } from '@cacic-fct/shared-event-preparation';
import { Prisma, type ContentReview } from '@prisma/client';

type Change<T> = {
  key: string;
  before: T;
  after: T;
  authorName: string;
};

const PROFILE_FIELDS = ['displayName', 'biography', 'email', 'whatsapp', 'linkedin', 'photo'] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];
type Photo = { publishGoogleUserPicture: boolean; googleUserPicture: string | null };
type ProfileValue = string | null | Photo;
type ProfileSnapshot = Record<Exclude<ProfileField, 'photo' | 'displayName'>, string | null> & {
  displayName: string;
  photo: Photo;
};
type ProfileData = Omit<ProfileSnapshot, 'photo'> & Photo;

type ProfileFieldChange = Change<ProfileValue> & { kind: 'profileField'; key: ProfileField };
type ProfileCreation = Change<ProfileSnapshot | null> & {
  kind: 'profileCreation';
  before: null;
  after: ProfileSnapshot;
};
type ProfileChange = ProfileFieldChange | ProfileCreation;
export type MaterialChange = Change<EventMaterial | null> & { kind: 'material' };
export type ContentChange = ProfileChange | MaterialChange;
export type ReviewTarget = { personId: string } | { eventId: string };

export function readChanges(review: ContentReview | null): ContentChange[] {
  // This JSON is written only by writeReview, after validating the original inputs.
  return review ? (review.changes as unknown as ContentChange[]) : [];
}

export async function writeReview(
  tx: Prisma.TransactionClient,
  target: ReviewTarget,
  existing: ContentReview | null,
  changes: ContentChange[],
  updatedAt?: Date,
): Promise<ContentReview | null> {
  if (!changes.length) {
    if (existing) await tx.contentReview.delete({ where: { id: existing.id } });
    return null;
  }
  const data = { changes: changes as unknown as Prisma.InputJsonArray, updatedAt };
  return existing
    ? tx.contentReview.update({ where: { id: existing.id }, data: { ...data, revision: { increment: 1 } } })
    : tx.contentReview.create({ data: { ...target, ...data } });
}

export function lockReviewPerson(tx: Prisma.TransactionClient, personId: string) {
  return tx.$executeRaw`SELECT "id" FROM "people" WHERE "id" = ${personId} FOR UPDATE`;
}

export function profileSnapshot(data: ProfileData): ProfileSnapshot {
  const { displayName, biography, email, whatsapp, linkedin, publishGoogleUserPicture, googleUserPicture } = data;
  return { displayName, biography, email, whatsapp, linkedin, photo: { publishGoogleUserPicture, googleUserPicture } };
}

export function mergeProfileChanges(
  review: ContentReview | null,
  before: ProfileSnapshot | null,
  after: ProfileSnapshot,
  authorName: string,
  administrator: boolean,
): ProfileChange[] {
  const existing = readChanges(review);
  const creation = existing.find((change) => change.kind === 'profileCreation');
  if (creation || !before) {
    if (administrator) return [];
    return [{ kind: 'profileCreation', key: 'profile', before: null, after, authorName }];
  }
  const changes = new Map(
    existing.flatMap((change) => (change.kind === 'profileField' ? [[change.key, change] as const] : [])),
  );
  for (const key of PROFILE_FIELDS) {
    if (isDeepStrictEqual(before[key], after[key])) continue;
    const pending = changes.get(key);
    const baseline = pending ? pending.before : before[key];
    if (administrator || isDeepStrictEqual(baseline, after[key])) {
      changes.delete(key);
    } else {
      changes.set(key, { kind: 'profileField', key, before: baseline, after: after[key], authorName });
    }
  }
  return [...changes.values()];
}

export function assertProfileChangeCurrent(current: ProfileSnapshot, change: ProfileChange): void {
  const value = change.kind === 'profileCreation' ? current : current[change.key];
  if (!isDeepStrictEqual(value, change.after)) {
    throw new ConflictException('O perfil foi alterado desde o envio. Atualize a fila antes de revisar.');
  }
}

export function restoreProfileFields(current: ProfileSnapshot, changes: ProfileFieldChange[]): ProfileData {
  const restored = { ...current };
  for (const change of changes) Object.assign(restored, { [change.key]: change.before });
  const { photo, ...fields } = restored;
  return { ...fields, ...photo };
}

export function materialKey(link: EventMaterial): string {
  // Derive a stable opaque identity for links saved before IDs existed.
  return link.id ?? createHash('sha256').update(link.url).digest('base64url');
}

export function diffMaterials(before: EventMaterial[], after: EventMaterial[], authorName: string): MaterialChange[] {
  const beforeByKey = new Map(before.map((link) => [materialKey(link), link]));
  const afterByKey = new Map(after.map((link) => [materialKey(link), link]));
  return [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])].flatMap((key) => {
    const oldLink = beforeByKey.get(key) ?? null;
    const newLink = afterByKey.get(key) ?? null;
    return isDeepStrictEqual(oldLink, newLink)
      ? []
      : [{ kind: 'material', key, before: oldLink, after: newLink, authorName }];
  });
}

export function applyMaterialChanges(links: EventMaterial[], changes: MaterialChange[]): EventMaterial[] {
  const byKey = new Map(links.map((link) => [materialKey(link), link]));
  for (const change of changes) {
    if (!isDeepStrictEqual(byKey.get(change.key) ?? null, change.before)) {
      throw new ConflictException('O material foi alterado desde o envio. Atualize a fila antes de revisar.');
    }
    if (change.after) byKey.set(change.key, change.after);
    else byKey.delete(change.key);
  }
  return [...byKey.values()];
}
