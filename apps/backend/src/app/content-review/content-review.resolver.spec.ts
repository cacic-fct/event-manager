import { jest } from '@jest/globals';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { AuditLogOperation, type Prisma } from '@prisma/client';
import { ContentReviewDecision } from './content-review.models';
import { ContentReviewResolver } from './content-review.resolver';
import { parseMaterialSubmission } from './material-review';
import {
  diffMaterials,
  materialKey,
  mergeProfileChanges,
  profileSnapshot,
  type ContentChange,
} from './content-review-changes';

const actor = { sub: 'reviewer' };
const slides = { title: 'Slides', url: 'https://example.org/slides' };
const slidesKey = materialKey(slides);
const updatedSlides = { id: slidesKey, title: 'Slides atualizados', url: 'https://example.org/slides-v2' };
const exercises = { title: 'Exercícios', url: 'https://example.org/exercises' };

function setup(target: { personId: string | null; eventId: string | null }, changes: ContentChange[]) {
  const review = { id: 'review', ...target, changes, revision: 2, updatedAt: new Date() };
  const contentReview = {
    findUnique: jest.fn<() => Promise<typeof review | null>>().mockResolvedValue(review),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const profile = {
    id: 'profile',
    displayName: 'Ana Mota',
    biography: 'Professora',
    email: 'ana@example.org',
    whatsapp: null,
    linkedin: null,
    publishGoogleUserPicture: false,
    googleUserPicture: null,
  };
  const tx = {
    $executeRaw: jest.fn(),
    contentReview,
    event: {
      findFirst: jest
        .fn<() => Promise<{ name: string; materials: Array<typeof slides>; materialsUpdatedAt: null } | null>>()
        .mockResolvedValue({ name: 'Oficina', materials: [slides], materialsUpdatedAt: null }),
      update: jest.fn(),
    },
    lecturerProfile: {
      findFirst: jest.fn<() => Promise<typeof profile | null>>().mockResolvedValue(profile),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const prisma = {
    contentReview,
    $transaction: jest.fn(async (work: (client: Prisma.TransactionClient) => Promise<unknown>) =>
      work(tx as unknown as Prisma.TransactionClient),
    ),
  };
  const authorization = {
    assertPermissions: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    accessibleEventTargets: jest.fn(),
  };
  const frozen = { assertEventUpdateMutable: jest.fn() };
  const audit = { record: jest.fn() };
  const invalidations = { publish: jest.fn() };
  const resolver = new ContentReviewResolver(
    prisma as never,
    { getAuthenticatedUser: () => actor } as never,
    authorization as never,
    frozen as never,
    audit as never,
    invalidations as never,
  );
  return { resolver, prisma, tx, review, profile, authorization, frozen, audit, invalidations };
}

describe('content review decisions', () => {
  it('reverts only the selected live profile field and audits the reviewer and field values', async () => {
    const { resolver, tx, audit } = setup({ personId: 'person', eventId: null }, [
      { kind: 'profileField', key: 'displayName', before: 'Ana', after: 'Ana Mota', authorName: 'Ana' },
      { kind: 'profileField', key: 'biography', before: null, after: 'Professora', authorName: 'Ana' },
    ]);
    await resolver.decideContentReview('review', 2, ['displayName'], ContentReviewDecision.REJECT, {});
    expect(tx.lecturerProfile.update).toHaveBeenCalledWith({
      where: { id: 'profile' },
      data: expect.objectContaining({ displayName: 'Ana', biography: 'Professora', updatedById: actor.sub }),
    });
    expect(tx.contentReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ changes: [expect.objectContaining({ key: 'biography' })] }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        operation: AuditLogOperation.REJECT,
        before: { displayName: 'Ana Mota' },
        after: { displayName: 'Ana' },
        scope: { permission: Permission.LecturerProfile.Review },
      }),
      tx,
    );
  });

  it('approves a material URL edit as one item and preserves the pending addition', async () => {
    const changes = diffMaterials([slides], [updatedSlides, exercises], 'Ana');
    const { resolver, tx, audit, authorization, frozen } = setup({ personId: null, eventId: 'event' }, changes);
    expect(changes).toHaveLength(2);

    await resolver.decideContentReview('review', 2, [slidesKey], ContentReviewDecision.APPROVE, {});
    expect(authorization.assertPermissions).toHaveBeenCalledWith(actor, [Permission.EventMaterials.Review], {
      eventId: 'event',
    });
    expect(frozen.assertEventUpdateMutable).toHaveBeenCalledWith('event', {}, actor);
    expect(tx.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ materials: [updatedSlides] }),
      }),
    );
    expect(tx.contentReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ changes: [expect.objectContaining({ after: exercises })] }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        operation: AuditLogOperation.APPROVE,
        before: { materials: [slides] },
        after: { materials: [updatedSlides] },
      }),
      tx,
    );
  });

  it('rejects a proposed deletion without changing the published materials and records the decision', async () => {
    const changes = diffMaterials([slides], [], 'Ana');
    const { resolver, tx, audit, invalidations } = setup({ personId: null, eventId: 'event' }, changes);
    await resolver.decideContentReview('review', 2, [slidesKey], ContentReviewDecision.REJECT, {});
    expect(tx.event.update).not.toHaveBeenCalled();
    expect(tx.contentReview.delete).toHaveBeenCalledWith({ where: { id: 'review' } });
    expect(invalidations.publish).toHaveBeenCalledWith('event');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        operation: AuditLogOperation.REJECT,
        after: { materials: [slides] },
      }),
      tx,
    );
  });

  it('requires dependent material changes to be approved together when a URL is reused', async () => {
    const replacement = { id: materialKey(exercises), title: exercises.title, url: slides.url };
    const changes = diffMaterials([slides], [replacement], 'Ana');
    const { resolver, tx, audit, invalidations } = setup({ personId: null, eventId: 'event' }, changes);

    await expect(
      resolver.decideContentReview('review', 2, [materialKey(replacement)], ContentReviewDecision.APPROVE, {}),
    ).rejects.toThrow(ConflictException);
    expect(tx.event.update).not.toHaveBeenCalled();
    expect(tx.contentReview.update).not.toHaveBeenCalled();
    expect(tx.contentReview.delete).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(invalidations.publish).not.toHaveBeenCalled();

    await expect(
      resolver.decideContentReview(
        'review',
        2,
        [slidesKey, materialKey(replacement)],
        ContentReviewDecision.APPROVE,
        {},
      ),
    ).resolves.toBe(true);
    expect(tx.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ materials: [replacement] }) }),
    );
    expect(tx.contentReview.delete).toHaveBeenCalledWith({ where: { id: 'review' } });
  });

  it('keeps distinct identities when a lecturer adds a URL that was edited previously', () => {
    const links = parseMaterialSubmission([updatedSlides, slides]);
    expect(new Set(links.map(materialKey)).size).toBe(2);
    expect(diffMaterials([updatedSlides], links, 'Ana')).toEqual([
      expect.objectContaining({ before: null, after: expect.objectContaining(slides) }),
    ]);
  });

  it('refuses stale revisions and users outside the event scope', async () => {
    const changes = diffMaterials([], [exercises], 'Ana');
    const { resolver, authorization, prisma, tx, audit } = setup({ personId: null, eventId: 'event' }, changes);
    await expect(
      resolver.decideContentReview('review', 1, [materialKey(exercises)], ContentReviewDecision.APPROVE, {}),
    ).rejects.toThrow(ConflictException);
    authorization.assertPermissions.mockRejectedValue(new ForbiddenException());
    await expect(
      resolver.decideContentReview('review', 2, [materialKey(exercises)], ContentReviewDecision.APPROVE, {}),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.event.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('preserves the original baseline across repeated profile saves', () => {
    const { profile } = setup({ personId: 'person', eventId: null }, []);
    const baseline = profileSnapshot(profile);
    const first = { ...baseline, displayName: 'Ana' };
    const initial = mergeProfileChanges(null, baseline, first, 'Ana', false);
    const review = { changes: initial } as never;
    expect(mergeProfileChanges(review, first, { ...first, displayName: 'Ana M.' }, 'Ana', false)).toEqual([
      expect.objectContaining({ key: 'displayName', before: 'Ana Mota', after: 'Ana M.' }),
    ]);
    expect(mergeProfileChanges(review, first, baseline, 'Ana', false)).toEqual([]);
  });
});
