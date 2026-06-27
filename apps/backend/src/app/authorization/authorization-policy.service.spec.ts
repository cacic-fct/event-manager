import { ForbiddenException } from '@nestjs/common';
import { CertificateScope, EventManagerPermissionGrantScope } from '@prisma/client';
import { EventManagerKeycloakRole, Permission } from '@cacic-fct/shared-permissions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from './authorization-policy.service';

describe('AuthorizationPolicyService', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: AuthorizationPolicyService;

  beforeEach(() => {
    prisma = createPrisma();
    service = new AuthorizationPolicyService(prisma as never);
  });

  it('requires the Event Manager access Keycloak role before DB grants are considered', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({ permission: Permission.Event.Read, scope: EventManagerPermissionGrantScope.GLOBAL }),
    ]);

    await expect(service.assertPermissions(user([]), [Permission.Event.Read])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.eventManagerPermissionGrant.findMany).not.toHaveBeenCalled();
  });

  it('lets the Event Manager super admin role bypass DB grants', async () => {
    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.SuperAdmin]), [Permission.Event.Delete]),
    ).resolves.toBeUndefined();
    expect(prisma.eventManagerPermissionGrant.findMany).not.toHaveBeenCalled();
  });

  it('authorizes global DB grants', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({ permission: Permission.Event.Read, scope: EventManagerPermissionGrantScope.GLOBAL }),
    ]);

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.Event.Read]),
    ).resolves.toBeUndefined();
  });

  it('fails closed when required permission names are invalid', async () => {
    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), ['event#reed']),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.eventManagerPermissionGrant.findMany).not.toHaveBeenCalled();
  });

  it('fails closed when guard context is built with invalid permission names', () => {
    expect(() => service.buildResourceContext({ id: 'event-1' }, ['event#reed'])).toThrow(ForbiddenException);
  });

  it('only considers grants inside their validity window', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({ permission: Permission.Event.Read, scope: EventManagerPermissionGrantScope.GLOBAL }),
    ]);

    await service.evaluatePermissions(user([EventManagerKeycloakRole.Access]), [Permission.Event.Read]);

    expect(prisma.eventManagerPermissionGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ validFrom: null }, { validFrom: { lte: expect.any(Date) } }],
          AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: expect.any(Date) } }] }],
        }),
      }),
    );
  });

  it('only returns global grants from global permission evaluation', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({ permission: Permission.Event.Read, scope: EventManagerPermissionGrantScope.EVENT, eventId: 'event-1' }),
      grant({ permission: Permission.Receipt.Read, scope: EventManagerPermissionGrantScope.GLOBAL }),
    ]);

    await expect(
      service.evaluateGlobalPermissions(user([EventManagerKeycloakRole.Access]), [
        Permission.Event.Read,
        Permission.Receipt.Read,
      ]),
    ).resolves.toEqual([Permission.Receipt.Read]);
  });

  it('does not surface scoped grants for global-only permissions', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.PermissionGrant.Update,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
      grant({
        permission: Permission.PermissionGrant.Read,
        scope: EventManagerPermissionGrantScope.GLOBAL,
      }),
    ]);

    await expect(
      service.evaluatePermissions(user([EventManagerKeycloakRole.Access]), [
        Permission.PermissionGrant.Update,
        Permission.PermissionGrant.Read,
      ]),
    ).resolves.toEqual([Permission.PermissionGrant.Read]);
  });

  it('matches major-event scoped grants through an event context', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.Event.Update,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
    ]);
    prisma.event.findUnique.mockResolvedValue({
      majorEventId: 'major-1',
      eventGroupId: 'group-1',
    });

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.Event.Update], {
        eventId: 'event-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('denies scoped grants when the operation has no matching target', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.Event.Update,
        scope: EventManagerPermissionGrantScope.EVENT,
        eventId: 'event-2',
      }),
    ]);
    prisma.event.findUnique.mockResolvedValue({
      majorEventId: null,
      eventGroupId: null,
    });

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.Event.Update], {
        eventId: 'event-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows explicitly scoped collection reads without a concrete target', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.MajorEvent.Read,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
    ]);

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.MajorEvent.Read], {
        allowScopedCollection: true,
      }),
    ).resolves.toBeUndefined();
  });

  it('returns scoped major-event ids for resolver filtering', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.MajorEvent.Read,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
      grant({
        permission: Permission.MajorEvent.Read,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-2',
      }),
      grant({
        permission: Permission.MajorEvent.Read,
        scope: EventManagerPermissionGrantScope.EVENT,
        eventId: 'event-1',
      }),
    ]);

    await expect(
      service.accessibleMajorEventIds(user([EventManagerKeycloakRole.Access]), Permission.MajorEvent.Read),
    ).resolves.toEqual(new Set(['major-1', 'major-2']));
  });

  it('returns scoped event targets for event resolver filtering', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.Event.Read,
        scope: EventManagerPermissionGrantScope.EVENT,
        eventId: 'event-1',
      }),
      grant({
        permission: Permission.Event.Read,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
      grant({
        permission: Permission.Event.Read,
        scope: EventManagerPermissionGrantScope.EVENT_GROUP,
        eventGroupId: 'group-1',
      }),
    ]);

    await expect(
      service.accessibleEventTargets(user([EventManagerKeycloakRole.Access]), Permission.Event.Read),
    ).resolves.toEqual({
      eventIds: new Set(['event-1']),
      majorEventIds: new Set(['major-1']),
      eventGroupIds: new Set(['group-1']),
    });
  });

  it('returns scoped event group ids for resolver filtering', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.EventGroup.Read,
        scope: EventManagerPermissionGrantScope.EVENT_GROUP,
        eventGroupId: 'group-1',
      }),
      grant({
        permission: Permission.EventGroup.Read,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
    ]);

    await expect(
      service.accessibleEventGroupIds(user([EventManagerKeycloakRole.Access]), Permission.EventGroup.Read),
    ).resolves.toEqual(new Set(['group-1']));
  });

  it('resolves generic subscription ids when subscription permissions are required with related resources', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.Subscription.Update,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
      grant({
        permission: Permission.Event.Read,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
      grant({
        permission: Permission.MajorEvent.Read,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
    ]);
    prisma.majorEventSubscription.findUnique.mockResolvedValue({
      majorEventId: 'major-1',
    });

    const context = service.buildResourceContext(
      {
        id: 'subscription-1',
        input: {
          subscriptionStatus: 'CONFIRMED',
        },
      },
      [Permission.Subscription.Update, Permission.Event.Read, Permission.MajorEvent.Read],
    );

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [
        Permission.Subscription.Update,
        Permission.Event.Read,
        Permission.MajorEvent.Read,
      ], context),
    ).resolves.toBeUndefined();
    expect(context.subscriptionId).toBe('subscription-1');
  });

  it('matches event-group scoped grants through an event-group subscription', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.Subscription.Read,
        scope: EventManagerPermissionGrantScope.EVENT_GROUP,
        eventGroupId: 'group-1',
      }),
    ]);
    prisma.eventGroupSubscription.findUnique.mockResolvedValue({
      eventGroupId: 'group-1',
    });

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.Subscription.Read], {
        subscriptionId: 'group-subscription-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('does not authorize primary resource mutations from nested input target ids', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.Event.Update,
        scope: EventManagerPermissionGrantScope.EVENT_GROUP,
        eventGroupId: 'allowed-group',
      }),
    ]);
    prisma.event.findUnique.mockResolvedValue({
      majorEventId: null,
      eventGroupId: 'other-group',
    });

    const context = service.buildResourceContext(
      {
        id: 'event-1',
        input: {
          eventGroupId: 'allowed-group',
        },
      },
      [Permission.Event.Update],
    );

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.Event.Update], context),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.event.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'event-1',
        },
      }),
    );
  });

  it('treats sourceEventId as the event target for draft mutations', () => {
    const context = service.buildResourceContext(
      {
        input: {
          sourceEventId: 'event-1',
        },
      },
      [Permission.Event.Update],
    );

    expect(context.eventId).toBe('event-1');
  });

  it('resolves certificate target ids for scoped certificate config grants', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.CertificateConfig.Read,
        scope: EventManagerPermissionGrantScope.EVENT_GROUP,
        eventGroupId: 'group-1',
      }),
    ]);

    const context = service.buildResourceContext(
      {
        scope: CertificateScope.EVENT_GROUP,
        targetId: 'group-1',
      },
      [Permission.CertificateConfig.Read],
    );

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.CertificateConfig.Read], context),
    ).resolves.toBeUndefined();
  });

  it('resolves certificate config ids for scoped certificate grants', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.Certificate.Issue,
        scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
    ]);
    prisma.certificateConfig.findFirst.mockResolvedValue({
      scope: CertificateScope.MAJOR_EVENT,
      eventId: null,
      eventGroupId: null,
      majorEventId: 'major-1',
    });

    const context = service.buildResourceContext(
      {
        configId: 'config-1',
      },
      [Permission.Certificate.Issue],
    );

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.Certificate.Issue], context),
    ).resolves.toBeUndefined();
  });

  it('resolves certificate ids for scoped certificate grants', async () => {
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.Certificate.Read,
        scope: EventManagerPermissionGrantScope.EVENT,
        eventId: 'event-1',
      }),
    ]);
    prisma.certificate.findFirst.mockResolvedValue({
      config: {
        scope: CertificateScope.EVENT,
        eventId: 'event-1',
        eventGroupId: null,
        majorEventId: null,
      },
    });
    prisma.event.findUnique.mockResolvedValue({
      majorEventId: null,
      eventGroupId: null,
    });

    const context = service.buildResourceContext(
      {
        certificateId: 'certificate-1',
      },
      [Permission.Certificate.Read],
    );

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.Certificate.Read], context),
    ).resolves.toBeUndefined();
  });

  it('keeps attendance collector access domain-derived', async () => {
    prisma.eventAttendanceCollector.findUnique.mockResolvedValue({
      eventId: 'event-1',
    });
    prisma.event.findUnique.mockResolvedValue({
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      deletedAt: null,
      publiclyVisible: true,
      shouldCollectAttendance: true,
    });

    await expect(service.assertAttendanceCollectorForEvent('event-1', 'person-1', {
      enforceCollectionWindow: true,
    })).resolves.toBeUndefined();
  });

  it('allows attendance managers to collect without an explicit collector row', async () => {
    prisma.event.findUnique
      .mockResolvedValueOnce({
        startDate: new Date(Date.now() - 60_000),
        endDate: new Date(Date.now() + 60_000),
        deletedAt: null,
        publiclyVisible: false,
        shouldCollectAttendance: true,
      })
      .mockResolvedValueOnce({
        majorEventId: null,
        eventGroupId: null,
      });
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValue([
      grant({
        permission: Permission.EventAttendance.Collect,
        scope: EventManagerPermissionGrantScope.EVENT,
        eventId: 'event-1',
      }),
    ]);

    await expect(service.assertAttendanceCollectorForEvent('event-1', 'person-1', {
      enforceCollectionWindow: true,
      user: user([EventManagerKeycloakRole.Access]),
    })).resolves.toBeUndefined();
  });

  it('allows super-admins to collect without an explicit collector row or DB grant', async () => {
    prisma.eventAttendanceCollector.findUnique.mockResolvedValue(null);
    prisma.event.findUnique.mockResolvedValue({
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      deletedAt: null,
      publiclyVisible: false,
      shouldCollectAttendance: true,
    });

    await expect(service.assertAttendanceCollectorForEvent('event-1', 'person-1', {
      enforceCollectionWindow: true,
      user: user([EventManagerKeycloakRole.SuperAdmin]),
    })).resolves.toBeUndefined();
    expect(prisma.eventManagerPermissionGrant.findMany).not.toHaveBeenCalled();
  });

  it('keeps lecturer subscriber-list access domain-derived', () => {
    expect(
      service.canLecturerViewSubscriberList({
        endDate: new Date(Date.now() + 60_000),
        shouldProvideSubscriberListToLecturer: true,
      }),
    ).toBe(true);

    expect(() =>
      service.assertLecturerCanViewSubscriberList(
        {
          endDate: new Date(Date.now() + 60_000),
          shouldProvideSubscriberListToLecturer: true,
          lecturers: [{ personId: 'other-person' }],
        },
        'person-1',
      ),
    ).toThrow(ForbiddenException);
  });
});

function createPrisma() {
  return {
    eventManagerPermissionGrant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    event: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    eventSubscription: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    eventGroupSubscription: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    majorEventSubscription: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    majorEventReceipt: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    majorEventReceiptValidationAction: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    eventAttendanceCollector: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    certificateConfig: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    certificate: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

function user(roles: string[]): AuthenticatedUser {
  return {
    realm_access: {
      roles,
    },
    sub: 'user-1',
    token: 'token',
    roles,
    roleSet: new Set(roles),
    permissions: [],
    permissionSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    claims: {},
  };
}

function grant(input: {
  permission: Permission;
  scope: EventManagerPermissionGrantScope;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
}) {
  return {
    permission: input.permission,
    scope: input.scope,
    eventId: input.eventId ?? null,
    majorEventId: input.majorEventId ?? null,
    eventGroupId: input.eventGroupId ?? null,
  };
}
