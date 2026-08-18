import { syncEventGroupMajorEvent } from './event-group-major-event';

describe('syncEventGroupMajorEvent', () => {
  it('assigns the shared major event when every live event agrees', async () => {
    const prisma = createPrismaMock();
    prisma.event.findMany.mockResolvedValue([{ majorEventId: 'major-1' }, { majorEventId: 'major-1' }]);

    await syncEventGroupMajorEvent(prisma as never, ['group-1']);

    expect(prisma.eventGroup.updateMany).toHaveBeenCalledWith({
      where: { id: 'group-1', deletedAt: null },
      data: { majorEventId: 'major-1' },
    });
  });

  it('uses the remaining event ownership after a group mutation', async () => {
    const prisma = createPrismaMock();
    prisma.event.findMany.mockResolvedValue([{ majorEventId: 'major-1' }]);

    await syncEventGroupMajorEvent(prisma as never, ['group-1', 'group-1']);

    expect(prisma.eventGroup.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.eventGroup.updateMany).toHaveBeenCalledWith({
      where: { id: 'group-1', deletedAt: null },
      data: { majorEventId: 'major-1' },
    });
  });

  it('clears group ownership when no live events remain', async () => {
    const prisma = createPrismaMock();

    await syncEventGroupMajorEvent(prisma as never, ['group-1']);

    expect(prisma.eventGroup.updateMany).toHaveBeenCalledWith({
      where: { id: 'group-1', deletedAt: null },
      data: { majorEventId: null },
    });
  });

  it('rejects mixed ownership instead of rewriting sibling events', async () => {
    const prisma = createPrismaMock();
    prisma.event.findMany.mockResolvedValue([{ majorEventId: 'major-1' }, { majorEventId: null }]);

    await expect(syncEventGroupMajorEvent(prisma as never, ['group-1'])).rejects.toThrow(
      'Os eventos deste grupo pertencem a grandes eventos diferentes.',
    );

    expect(prisma.eventGroup.updateMany).not.toHaveBeenCalled();
  });
});

function createPrismaMock() {
  return {
    event: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventGroup: {
      updateMany: jest.fn(),
    },
  };
}
