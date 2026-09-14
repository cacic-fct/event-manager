import { Prisma } from '@prisma/client';
import {
  moveAudienceInvitations,
  restoreAudienceInvitations,
  type AudienceInvitationSnapshot,
} from './audience-invitations';

describe('people merge audience invitations', () => {
  it('moves all invitation kinds, skips target conflicts, and preserves notification metadata', async () => {
    const tx = createTransaction();
    const createdAt = new Date('2026-01-01T10:00:00.000Z');
    const notifiedAt = new Date('2026-01-02T10:00:00.000Z');
    const attemptedAt = new Date('2026-01-03T10:00:00.000Z');
    tx.eventAudienceInvitation.findMany
      .mockResolvedValueOnce([
        {
          eventId: 'event-conflict',
          personId: 'source-person',
          createdAt,
          createdById: 'creator-event',
          notifiedAt,
          notificationAttemptedAt: attemptedAt,
        },
        {
          eventId: 'event-move',
          personId: 'source-person',
          createdAt,
          createdById: 'creator-event-move',
          notifiedAt: null,
          notificationAttemptedAt: null,
        },
      ])
      .mockResolvedValueOnce([{ eventId: 'event-conflict' }]);
    tx.eventGroupAudienceInvitation.findMany
      .mockResolvedValueOnce([
        {
          eventGroupId: 'group-move',
          personId: 'source-person',
          createdAt,
          createdById: null,
          notifiedAt,
          notificationAttemptedAt: null,
        },
      ])
      .mockResolvedValueOnce([]);
    tx.majorEventAudienceInvitation.findMany
      .mockResolvedValueOnce([
        {
          majorEventId: 'major-move',
          personId: 'source-person',
          createdAt,
          createdById: 'creator-major',
          notifiedAt: null,
          notificationAttemptedAt: attemptedAt,
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(moveAudienceInvitations(tx as never, 'source-person', 'target-person')).resolves.toEqual([
      {
        targetType: 'EVENT',
        targetId: 'event-move',
        personId: 'source-person',
        createdAt: createdAt.toISOString(),
        createdById: 'creator-event-move',
        notifiedAt: null,
        notificationAttemptedAt: null,
      },
      {
        targetType: 'EVENT_GROUP',
        targetId: 'group-move',
        personId: 'source-person',
        createdAt: createdAt.toISOString(),
        createdById: null,
        notifiedAt: notifiedAt.toISOString(),
        notificationAttemptedAt: null,
      },
      {
        targetType: 'MAJOR_EVENT',
        targetId: 'major-move',
        personId: 'source-person',
        createdAt: createdAt.toISOString(),
        createdById: 'creator-major',
        notifiedAt: null,
        notificationAttemptedAt: attemptedAt.toISOString(),
      },
    ]);

    expect(tx.eventAudienceInvitation.update).toHaveBeenCalledWith({
      where: { eventId_personId: { eventId: 'event-move', personId: 'source-person' } },
      data: { personId: 'target-person' },
    });
    expect(tx.eventAudienceInvitation.update).toHaveBeenCalledTimes(1);
    expect(tx.eventGroupAudienceInvitation.update).toHaveBeenCalledWith({
      where: { eventGroupId_personId: { eventGroupId: 'group-move', personId: 'source-person' } },
      data: { personId: 'target-person' },
    });
    expect(tx.majorEventAudienceInvitation.update).toHaveBeenCalledWith({
      where: { majorEventId_personId: { majorEventId: 'major-move', personId: 'source-person' } },
      data: { personId: 'target-person' },
    });
  });

  it('restores only rows moved by the merge and detects changed rows', async () => {
    const tx = createTransaction();
    const snapshots: AudienceInvitationSnapshot[] = [
      {
        targetType: 'EVENT',
        targetId: 'event-1',
        personId: 'source-person',
        createdAt: '2026-01-01T10:00:00.000Z',
        createdById: 'creator',
        notifiedAt: '2026-01-02T10:00:00.000Z',
        notificationAttemptedAt: null,
      },
      {
        targetType: 'EVENT_GROUP',
        targetId: 'group-1',
        personId: 'source-person',
        createdAt: '2026-01-01T10:00:00.000Z',
        createdById: null,
        notifiedAt: null,
        notificationAttemptedAt: null,
      },
      {
        targetType: 'MAJOR_EVENT',
        targetId: 'major-1',
        personId: 'source-person',
        createdAt: '2026-01-01T10:00:00.000Z',
        createdById: null,
        notifiedAt: null,
        notificationAttemptedAt: null,
      },
    ];
    tx.eventAudienceInvitation.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.eventGroupAudienceInvitation.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.majorEventAudienceInvitation.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      restoreAudienceInvitations(tx as never, snapshots, 'source-person', 'target-person'),
    ).resolves.toBeUndefined();

    expect(tx.eventAudienceInvitation.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1', personId: 'target-person', createdAt: new Date(snapshots[0].createdAt) },
      data: { personId: 'source-person' },
    });
    expect(tx.eventGroupAudienceInvitation.updateMany).toHaveBeenCalledWith({
      where: { eventGroupId: 'group-1', personId: 'target-person', createdAt: new Date(snapshots[0].createdAt) },
      data: { personId: 'source-person' },
    });
    expect(tx.majorEventAudienceInvitation.updateMany).toHaveBeenCalledWith({
      where: { majorEventId: 'major-1', personId: 'target-person', createdAt: new Date(snapshots[0].createdAt) },
      data: { personId: 'source-person' },
    });

    tx.eventAudienceInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      restoreAudienceInvitations(tx as never, [snapshots[0]], 'source-person', 'target-person'),
    ).rejects.toThrow('changed after the people merge');
  });
});

function createTransaction() {
  return {
    eventAudienceInvitation: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    eventGroupAudienceInvitation: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    majorEventAudienceInvitation: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  } as unknown as Prisma.TransactionClient;
}
