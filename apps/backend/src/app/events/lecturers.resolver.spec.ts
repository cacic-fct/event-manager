import { Permission } from '@cacic-fct/shared-permissions';
import { EventLecturersResolver } from './lecturers.resolver';

describe('EventLecturersResolver authorization', () => {
  it('requires update permission on the replacement event when moving a lecturer assignment', async () => {
    const prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      people: {
        findFirst: jest.fn().mockResolvedValue({ id: 'person-1', name: 'Ada Lovelace' }),
      },
      lecturerProfile: {
        upsert: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      },
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
    expect(prisma.lecturerProfile.upsert).not.toHaveBeenCalled();
  });

  it('creates a disabled lecturer profile from the person name before adding a lecturer to an event', async () => {
    const prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      people: {
        findFirst: jest.fn().mockResolvedValue({ id: 'person-1', name: 'Grace Hopper' }),
      },
      lecturerProfile: {
        upsert: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      },
      eventLecturer: {
        create: jest.fn().mockResolvedValue({
          eventId: 'event-1',
          personId: 'person-1',
          createdById: 'user-1',
        }),
      },
    };
    const resolver = new EventLecturersResolver(
      prisma as never,
      { assertEventMutable: jest.fn() } as never,
      { assertPermissions: jest.fn() } as never,
    );

    await expect(
      resolver.createEventLecturer(
        { eventId: 'event-1', personId: 'person-1' },
        { req: { user: { sub: 'user-1' } as never } },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        eventId: 'event-1',
        personId: 'person-1',
      }),
    );

    expect(prisma.people.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'person-1',
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
    });
    expect(prisma.lecturerProfile.upsert).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
      },
      create: {
        personId: 'person-1',
        displayName: 'Grace Hopper',
        publishGoogleUserPicture: false,
        googleUserPicture: null,
        createdById: 'user-1',
        updatedById: 'user-1',
      },
      update: {},
      select: {
        id: true,
      },
    });
    expect(prisma.eventLecturer.create).toHaveBeenCalledWith({
      data: {
        eventId: 'event-1',
        personId: 'person-1',
        createdById: 'user-1',
      },
    });
  });
});
