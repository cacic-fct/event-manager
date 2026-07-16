import { Permission } from '@cacic-fct/shared-permissions';
import { NotFoundException } from '@nestjs/common';
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
        findUniqueOrThrow: jest.fn().mockResolvedValue({
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

  it('lists lecturer assignments with optional filters and pagination', () => {
    const { prisma, resolver } = createResolver();
    prisma.eventLecturer.findMany.mockReturnValue([{ eventId: 'event-1', personId: 'person-1' }]);

    expect(resolver.eventLecturers('event-1', 'person-1', 5, 10)).toEqual([
      { eventId: 'event-1', personId: 'person-1' },
    ]);

    expect(prisma.eventLecturer.findMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event-1',
        personId: 'person-1',
      },
      select: expect.objectContaining({
        eventId: true,
        personId: true,
        event: expect.any(Object),
      }),
      orderBy: {
        createdAt: 'desc',
      },
      skip: 5,
      take: 10,
    });
  });

  it('loads one lecturer assignment by event and person ids', async () => {
    const { prisma, resolver } = createResolver();
    prisma.eventLecturer.findUnique.mockResolvedValue({ eventId: 'event-1', personId: 'person-1' });

    await expect(resolver.eventLecturer('event-1', 'person-1')).resolves.toEqual({
      eventId: 'event-1',
      personId: 'person-1',
    });

    expect(prisma.eventLecturer.findUnique).toHaveBeenCalledWith({
      where: {
        eventId_personId: {
          eventId: 'event-1',
          personId: 'person-1',
        },
      },
      select: expect.objectContaining({
        eventId: true,
        personId: true,
        event: expect.any(Object),
      }),
    });
  });

  it('throws not found when one lecturer assignment does not exist', async () => {
    const { prisma, resolver } = createResolver();
    prisma.eventLecturer.findUnique.mockResolvedValue(null);

    await expect(resolver.eventLecturer('event-1', 'person-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates a lecturer person and creates a lecturer profile with the request user actor', async () => {
    const { frozenResources, prisma, resolver } = createResolver();
    const user = { sub: 'request-user' };
    prisma.people.findFirst.mockResolvedValue({ id: 'person-2', name: 'Katherine Johnson' });
    prisma.eventLecturer.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventLecturer.findUnique.mockResolvedValue({ eventId: 'event-1', personId: 'person-2' });
    prisma.eventLecturer.findUniqueOrThrow.mockResolvedValue({ eventId: 'event-1', personId: 'person-2' });

    await expect(
      resolver.updateEventLecturer(
        'event-1',
        'person-1',
        { personId: 'person-2' },
        { request: { user: user as never } },
      ),
    ).resolves.toEqual({ eventId: 'event-1', personId: 'person-2' });

    expect(frozenResources.assertEventMutable).toHaveBeenCalledWith('event-1', user, 'edit');
    expect(prisma.lecturerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          personId: 'person-2',
        },
        create: expect.objectContaining({
          displayName: 'Katherine Johnson',
          createdById: 'request-user',
          updatedById: 'request-user',
        }),
      }),
    );
    expect(prisma.eventLecturer.updateMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event-1',
        personId: 'person-1',
      },
      data: {
        personId: 'person-2',
      },
    });
    expect(prisma.eventLecturer.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId_personId: {
            eventId: 'event-1',
            personId: 'person-2',
          },
        },
      }),
    );
  });

  it('throws not found when updating a missing lecturer assignment', async () => {
    const { prisma, resolver } = createResolver();
    prisma.eventLecturer.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      resolver.updateEventLecturer('event-1', 'person-1', {}, { req: { user: { sub: 'user-1' } as never } }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.eventLecturer.findUnique).toHaveBeenCalledWith({
      where: {
        eventId_personId: {
          eventId: 'event-1',
          personId: 'person-1',
        },
      },
    });
  });

  it('throws not found when creating a lecturer assignment for a missing person', async () => {
    const { prisma, resolver } = createResolver();
    prisma.people.findFirst.mockResolvedValue(null);

    await expect(
      resolver.createEventLecturer(
        { eventId: 'event-1', personId: 'person-1' },
        { req: { user: { sub: 'user-1' } as never } },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.eventLecturer.create).not.toHaveBeenCalled();
  });

  it('deletes lecturer assignments after frozen delete validation', async () => {
    const { frozenResources, prisma, resolver } = createResolver();
    const user = { sub: 'user-1' };
    prisma.eventLecturer.findUnique.mockResolvedValue({ eventId: 'event-1', personId: 'person-1' });

    await expect(resolver.deleteEventLecturer('event-1', 'person-1', { req: { user: user as never } })).resolves.toEqual({
      deleted: true,
      eventId: 'event-1',
      personId: 'person-1',
    });

    expect(frozenResources.assertEventMutable).toHaveBeenCalledWith('event-1', user, 'delete');
    expect(prisma.eventLecturer.delete).toHaveBeenCalledWith({
      where: {
        eventId_personId: {
          eventId: 'event-1',
          personId: 'person-1',
        },
      },
    });
  });

  it('throws not found when deleting a missing lecturer assignment', async () => {
    const { prisma, resolver } = createResolver();
    prisma.eventLecturer.findUnique.mockResolvedValue(null);

    await expect(
      resolver.deleteEventLecturer('event-1', 'person-1', { req: { user: { sub: 'user-1' } as never } }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function createResolver() {
  const prisma = {
    $transaction: jest.fn((callback) => callback(prisma)),
    people: {
      findFirst: jest.fn(),
    },
    lecturerProfile: {
      upsert: jest.fn(),
    },
    eventLecturer: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      delete: jest.fn(),
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

  return {
    authorizationPolicy,
    frozenResources,
    prisma,
    resolver,
  };
}
