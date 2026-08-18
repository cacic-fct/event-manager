import { syncEventGroupMajorEvent } from './event-group-major-event';

describe('syncEventGroupMajorEvent', () => {
  it('assigns the shared major event when every live event agrees', async () => {
    const prisma = createPrismaMock();
    prisma.event.findFirst.mockResolvedValue({ majorEventId: 'major-1' });

    await syncEventGroupMajorEvent(prisma as never, ['group-1']);

    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { eventGroupId: 'group-1', deletedAt: null },
      data: { majorEventId: 'major-1' },
    });
    expect(prisma.eventGroup.updateMany).toHaveBeenCalledWith({
      where: { id: 'group-1', deletedAt: null },
      data: { majorEventId: 'major-1' },
    });
  });

  it('uses the remaining event ownership after a group mutation', async () => {
    const prisma = createPrismaMock();
    prisma.event.findFirst.mockResolvedValue({ majorEventId: 'major-1' });

    await syncEventGroupMajorEvent(prisma as never, ['group-1', 'group-1']);

    expect(prisma.eventGroup.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.eventGroup.updateMany).toHaveBeenCalledWith({
      where: { id: 'group-1', deletedAt: null },
      data: { majorEventId: 'major-1' },
    });
  });
});

function createPrismaMock() {
  return {
    event: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn(),
    },
    eventGroup: {
      updateMany: jest.fn(),
    },
  };
}
