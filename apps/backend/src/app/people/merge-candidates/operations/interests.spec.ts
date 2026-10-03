import { Prisma } from '@prisma/client';
import { moveEventInterests } from './interests';

describe('merge interest history', () => {
  it('moves history and retires active duplicates for restoration on undo', async () => {
    const eventInterest = {
      findMany: jest.fn().mockResolvedValueOnce([
        { id: 'duplicate', eventId: 'event-1', eventGroupId: null, majorEventId: null, deletedAt: null },
        { id: 'group', eventId: null, eventGroupId: 'group-1', majorEventId: null, deletedAt: null },
        { id: 'history', eventId: 'event-1', eventGroupId: null, majorEventId: null, deletedAt: new Date(Date.now() - 86_400_000) },
      ]).mockResolvedValueOnce([
        { id: 'target', eventId: 'event-1', eventGroupId: null, majorEventId: null, deletedAt: null },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    };
    const tx = { eventInterest } as unknown as Prisma.TransactionClient;
    await expect(moveEventInterests(tx, 'source', 'target')).resolves.toEqual({ movedIds: ['group', 'history'], retiredIds: ['duplicate'] });
    expect(eventInterest.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['group', 'history'] }, personId: 'source' },
      data: { personId: 'target' },
    });
    expect(eventInterest.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['duplicate'] }, personId: 'source', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
