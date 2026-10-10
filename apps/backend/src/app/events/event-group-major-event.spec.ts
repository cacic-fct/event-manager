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
      eventGroup: { updateMany: jest.fn() },
    };
    await expect(audienceContext.run(ANONYMOUS_AUDIENCE, async () =>
      syncEventGroupMajorEvent(prisma as never, ['group-1']),
    )).rejects.toThrow('grandes eventos diferentes');
    expect(prisma.eventGroup.updateMany).not.toHaveBeenCalled();
    expect(audienceContext.getStore()).toBeUndefined();
  });
});
