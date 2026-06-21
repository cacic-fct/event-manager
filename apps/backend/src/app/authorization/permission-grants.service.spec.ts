import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EventManagerPermissionGrantScope } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { PermissionGrantsService } from './permission-grants.service';

describe('PermissionGrantsService', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: PermissionGrantsService;

  beforeEach(() => {
    prisma = createPrisma();
    service = new PermissionGrantsService(prisma as never);
  });

  it('creates a global grant from the shared catalog', async () => {
    prisma.eventManagerPermissionGrant.create.mockResolvedValue(grantRecord({
      permission: Permission.Event.Read,
      scope: EventManagerPermissionGrantScope.GLOBAL,
    }));

    await expect(
      service.createGrant({
        userId: 'user-1',
        personId: 'person-1',
        permission: Permission.Event.Read,
        scope: EventManagerPermissionGrantScope.GLOBAL,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        userId: 'user-1',
        personId: 'person-1',
        permission: Permission.Event.Read,
        scope: EventManagerPermissionGrantScope.GLOBAL,
      }),
    );

    expect(prisma.eventManagerPermissionGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          personId: 'person-1',
          permission: Permission.Event.Read,
          scope: EventManagerPermissionGrantScope.GLOBAL,
        }),
      }),
    );
  });

  it('rejects permissions outside the shared catalog', async () => {
    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: 'unknown#grant',
        scope: EventManagerPermissionGrantScope.GLOBAL,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects global grants with scoped targets', async () => {
    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: Permission.Event.Read,
        scope: EventManagerPermissionGrantScope.GLOBAL,
        eventId: 'event-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates event-scoped grants for active events', async () => {
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
    prisma.eventManagerPermissionGrant.create.mockResolvedValue(
      grantRecord({
        permission: Permission.Event.Update,
        scope: EventManagerPermissionGrantScope.EVENT,
        eventId: 'event-1',
        eventName: 'Aula aberta',
      }),
    );

    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: Permission.Event.Update,
        scope: EventManagerPermissionGrantScope.EVENT,
        eventId: 'event-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        eventId: 'event-1',
        targetLabel: 'Aula aberta',
      }),
    );
  });

  it('rejects scoped grants with targets from a different scope', async () => {
    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: Permission.Event.Update,
        scope: EventManagerPermissionGrantScope.EVENT,
        eventId: 'event-1',
        majorEventId: 'major-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists event targets for permission grant management without requiring the event resolver', async () => {
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'event-1',
        name: 'Credenciamento',
        majorEvent: {
          name: 'CACiC',
        },
      },
      {
        id: 'event-2',
        name: 'Aula aberta',
        majorEvent: null,
      },
    ]);

    await expect(service.listGrantTargets(EventManagerPermissionGrantScope.EVENT)).resolves.toEqual([
      expect.objectContaining({
        id: 'event-1',
        label: 'Credenciamento',
        description: 'CACiC',
      }),
      expect.objectContaining({
        id: 'event-2',
        label: 'Aula aberta',
        description: 'Evento sem grande evento',
      }),
    ]);
  });

  it('rejects scoped duplicate-person grants because they only make sense globally', async () => {
    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: Permission.MergeCandidate.Merge,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects scoped person mutation grants because they only make sense globally', async () => {
    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: Permission.Person.Update,
        scope: EventManagerPermissionGrantScope.EVENT_GROUP,
        eventGroupId: 'group-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects scoped person read grants because person operations are not target-scoped', async () => {
    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: Permission.Person.Read,
        scope: EventManagerPermissionGrantScope.EVENT_GROUP,
        eventGroupId: 'group-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects scoped place and user grants because those operations are not target-scoped', async () => {
    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: Permission.PlacePreset.Read,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: Permission.User.Read,
        scope: EventManagerPermissionGrantScope.EVENT,
        eventId: 'event-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects scoped permission-management grants because they only make sense globally', async () => {
    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: Permission.PermissionGrant.Update,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates grants with a finite validity window', async () => {
    const validFrom = new Date('2099-01-01T12:00:00.000Z');
    const validUntil = new Date('2099-01-10T12:00:00.000Z');
    prisma.eventManagerPermissionGrant.create.mockResolvedValue(grantRecord({
      permission: Permission.Person.Read,
      scope: EventManagerPermissionGrantScope.GLOBAL,
      validFrom,
      validUntil,
    }));

    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: Permission.Person.Read,
        scope: EventManagerPermissionGrantScope.GLOBAL,
        validFrom,
        validUntil,
      }),
    ).resolves.toEqual(expect.objectContaining({ validFrom, validUntil }));

    expect(prisma.eventManagerPermissionGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          validFrom,
          validUntil,
        }),
      }),
    );
  });

  it('rejects validity windows where the end is not after the start', async () => {
    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: Permission.Person.Read,
        scope: EventManagerPermissionGrantScope.GLOBAL,
        validFrom: new Date('2099-01-10T12:00:00.000Z'),
        validUntil: new Date('2099-01-01T12:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects changing an existing grant validity window through duplicate creation', async () => {
    prisma.eventManagerPermissionGrant.findFirst.mockResolvedValue(grantRecord({
      permission: Permission.Person.Read,
      scope: EventManagerPermissionGrantScope.GLOBAL,
      validUntil: new Date('2099-01-01T12:00:00.000Z'),
    }));

    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: Permission.Person.Read,
        scope: EventManagerPermissionGrantScope.GLOBAL,
        validUntil: new Date('2099-02-01T12:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects scoped grants for deleted or missing targets', async () => {
    prisma.majorEvent.findFirst.mockResolvedValue(null);

    await expect(
      service.createGrant({
        userId: 'user-1',
        permission: Permission.Receipt.Read,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('soft deletes active grants', async () => {
    prisma.eventManagerPermissionGrant.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.deleteGrant('grant-1', 'actor-1')).resolves.toBeUndefined();

    expect(prisma.eventManagerPermissionGrant.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'grant-1',
        deletedAt: null,
      },
      data: {
        deletedAt: expect.any(Date),
        updatedById: 'actor-1',
      },
    });
  });

  it('updates an active grant without deleting it', async () => {
    prisma.eventManagerPermissionGrant.findFirst
      .mockResolvedValueOnce({ userId: 'user-1', personId: 'person-1' })
      .mockResolvedValueOnce(null);
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.eventManagerPermissionGrant.update.mockResolvedValue(grantRecord({
      permission: Permission.Receipt.Approve,
      scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
      majorEventId: 'major-1',
      majorEventName: 'CACiC',
      validUntil: new Date('2099-02-01T12:00:00.000Z'),
    }));

    await expect(
      service.updateGrant('grant-1', {
        permission: Permission.Receipt.Approve,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
        validUntil: new Date('2099-02-01T12:00:00.000Z'),
      }, 'actor-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        permission: Permission.Receipt.Approve,
        majorEventId: 'major-1',
        targetLabel: 'CACiC',
      }),
    );

    expect(prisma.eventManagerPermissionGrant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'grant-1',
          deletedAt: null,
        },
        data: expect.objectContaining({
          userId: 'user-1',
          personId: 'person-1',
          permission: Permission.Receipt.Approve,
          scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
          eventId: null,
          majorEventId: 'major-1',
          eventGroupId: null,
          updatedById: 'actor-1',
        }),
      }),
    );
  });

  it('preserves explicit null validity values when updating a grant', async () => {
    prisma.eventManagerPermissionGrant.findFirst
      .mockResolvedValueOnce({ userId: 'user-1', personId: 'person-1' })
      .mockResolvedValueOnce(null);
    prisma.eventManagerPermissionGrant.update.mockResolvedValue(grantRecord({
      permission: Permission.Event.Read,
      scope: EventManagerPermissionGrantScope.GLOBAL,
      validFrom: null,
      validUntil: null,
    }));

    await expect(
      service.updateGrant('grant-1', {
        permission: Permission.Event.Read,
        scope: EventManagerPermissionGrantScope.GLOBAL,
        validFrom: null,
        validUntil: null,
      }),
    ).resolves.toEqual(expect.objectContaining({ validFrom: null, validUntil: null }));

    expect(prisma.eventManagerPermissionGrant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          validFrom: null,
          validUntil: null,
        }),
      }),
    );
  });

  it('rejects updates that would duplicate another active grant', async () => {
    prisma.eventManagerPermissionGrant.findFirst
      .mockResolvedValueOnce({ userId: 'user-1', personId: 'person-1' })
      .mockResolvedValueOnce(grantRecord({
        permission: Permission.Event.Read,
        scope: EventManagerPermissionGrantScope.GLOBAL,
      }));

    await expect(
      service.updateGrant('grant-1', {
        permission: Permission.Event.Read,
        scope: EventManagerPermissionGrantScope.GLOBAL,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

function createPrisma() {
  return {
    eventManagerPermissionGrant: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
    people: {
      findFirst: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    },
    event: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    majorEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventGroup: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function grantRecord(input: {
  permission: Permission;
  scope: EventManagerPermissionGrantScope;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  eventName?: string | null;
  majorEventName?: string | null;
  eventGroupName?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
}) {
  return {
    id: 'grant-1',
    userId: 'user-1',
    personId: 'person-1',
    permission: input.permission,
    scope: input.scope,
    eventId: input.eventId ?? null,
    majorEventId: input.majorEventId ?? null,
    eventGroupId: input.eventGroupId ?? null,
    event: input.eventName ? { name: input.eventName } : null,
    majorEvent: input.majorEventName ? { name: input.majorEventName } : null,
    eventGroup: input.eventGroupName ? { name: input.eventGroupName } : null,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    createdAt: new Date('2026-06-21T12:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-06-21T12:00:00.000Z'),
    updatedById: null,
  };
}
