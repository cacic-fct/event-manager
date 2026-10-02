import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { syncEventGroupMajorEvent } from './event-group-major-event';

describe('group parent consistency with restricted children', () => {
  it('checks hidden children before changing the group parent', async () => {
    const prisma = {
      event: {
        findMany: jest.fn(async () => audienceContext.getStore()?.bypass
          ? [{ majorEventId: 'original-major' }, { majorEventId: 'requested-major' }]
          : [{ majorEventId: 'requested-major' }]),
      },
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([{ id: 'group-1', majorEventId: null }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    await expect(audienceContext.run(ANONYMOUS_AUDIENCE, async () =>
      syncEventGroupMajorEvent(prisma as never, ['group-1']),
    )).rejects.toThrow('grandes eventos diferentes');
    expect(prisma.eventGroup.updateMany).not.toHaveBeenCalled();
    expect(audienceContext.getStore()).toBeUndefined();
  });

  it('preserves an explicit parent when the last child is removed', async () => {
    const prisma = {
      event: { findMany: jest.fn().mockResolvedValue([]) },
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([{ id: 'group-1', majorEventId: 'major-1' }]),
        updateMany: jest.fn(),
      },
    };

    await syncEventGroupMajorEvent(prisma as never, ['group-1']);

    expect(prisma.eventGroup.updateMany).not.toHaveBeenCalled();
  });

  it('rejects the first child when it conflicts with an explicit parent', async () => {
    const prisma = {
      event: { findMany: jest.fn().mockResolvedValue([{ majorEventId: 'major-2' }]) },
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([{ id: 'group-1', majorEventId: 'major-1' }]),
        updateMany: jest.fn(),
      },
    };

    await expect(syncEventGroupMajorEvent(prisma as never, ['group-1'])).rejects.toThrow('outro grande evento');
    expect(prisma.eventGroup.updateMany).not.toHaveBeenCalled();
  });

  it('accepts a child matching an explicit parent', async () => {
    const prisma = {
      event: { findMany: jest.fn().mockResolvedValue([{ majorEventId: 'major-1' }]) },
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([{ id: 'group-1', majorEventId: 'major-1' }]),
        updateMany: jest.fn(),
      },
    };

    await syncEventGroupMajorEvent(prisma as never, ['group-1']);

    expect(prisma.eventGroup.updateMany).not.toHaveBeenCalled();
  });

  it('adopts a coherent child parent for a legacy null-parent group', async () => {
    const prisma = {
      event: { findMany: jest.fn().mockResolvedValue([{ majorEventId: 'major-1' }]) },
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([{ id: 'group-1', majorEventId: null }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await syncEventGroupMajorEvent(prisma as never, ['group-1']);

    expect(prisma.eventGroup.updateMany).toHaveBeenCalledWith({
      where: { id: 'group-1', deletedAt: null, majorEventId: null },
      data: { majorEventId: 'major-1' },
    });
  });

  it('rejects a legacy group with restricted children from different parents', async () => {
    const prisma = {
      event: {
        findMany: jest.fn(async () => audienceContext.getStore()?.bypass
          ? [{ majorEventId: 'major-1' }, { majorEventId: 'major-2' }]
          : [{ majorEventId: 'major-1' }]),
      },
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([{ id: 'group-1', majorEventId: null }]),
        updateMany: jest.fn(),
      },
    };

    await expect(audienceContext.run(ANONYMOUS_AUDIENCE, async () =>
      syncEventGroupMajorEvent(prisma as never, ['group-1']),
    )).rejects.toThrow('grandes eventos diferentes');
    expect(prisma.eventGroup.updateMany).not.toHaveBeenCalled();
  });
});
