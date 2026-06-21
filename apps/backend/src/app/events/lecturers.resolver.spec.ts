import { Permission } from '@cacic-fct/shared-permissions';
import { EventLecturersResolver } from './lecturers.resolver';

describe('EventLecturersResolver authorization', () => {
  it('requires update permission on the replacement event when moving a lecturer assignment', async () => {
    const prisma = {
      eventLecturer: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          eventId: 'event-b',
          personId: 'person-1',
        }),
      },
    };
    const frozenResources = {
      assertEventMutable: jest.fn(),
    };
    const authorizationPolicy = {
      assertPermissions: jest.fn(),
    };
    const resolver = new EventLecturersResolver(
      prisma as never,
      frozenResources as never,
      authorizationPolicy as never,
    );
    const user = { sub: 'user-1' };

    await expect(
      resolver.updateEventLecturer(
        'event-a',
        'person-1',
        {
          eventId: 'event-b',
        },
        { req: { user: user as never } },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        eventId: 'event-b',
      }),
    );

    expect(frozenResources.assertEventMutable).toHaveBeenNthCalledWith(1, 'event-a', user, 'edit');
    expect(frozenResources.assertEventMutable).toHaveBeenNthCalledWith(2, 'event-b', user, 'edit');
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(user, [Permission.EventLecturer.Update], {
      eventId: 'event-b',
    });
  });
});
