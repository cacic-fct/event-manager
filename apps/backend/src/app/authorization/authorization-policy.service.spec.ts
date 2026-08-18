import { ForbiddenException } from '@nestjs/common';
import { CertificateScope, EventManagerPermissionScope } from '@prisma/client';
import { EVENT_MANAGER_PERMISSION_CATALOG, EventManagerKeycloakRole, Permission } from '@cacic-fct/shared-permissions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from './authorization-policy.service';
import { findActiveRolePermissionScopes } from './effective-role-scopes';

jest.mock('./effective-role-scopes', () => ({ findActiveRolePermissionScopes: jest.fn() }));
const activeScopes = jest.mocked(findActiveRolePermissionScopes);

describe('AuthorizationPolicyService', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: AuthorizationPolicyService;

  beforeEach(() => {
    activeScopes.mockReset();
    activeScopes.mockResolvedValue([]);
    prisma = createPrisma();
    service = new AuthorizationPolicyService(prisma as never);
  });

  it('requires the Event Manager access Keycloak role before DB grants are considered', async () => {
    activeScopes.mockResolvedValue([
      grant({ permission: Permission.Event.Read, scope: EventManagerPermissionScope.GLOBAL }),
    ]);

    await expect(service.assertPermissions(user([]), [Permission.Event.Read])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(activeScopes).not.toHaveBeenCalled();
  });

  it('lets the Event Manager super admin role bypass DB grants', async () => {
    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.SuperAdmin]), [Permission.Event.Delete]),
    ).resolves.toBeUndefined();
    expect(activeScopes).not.toHaveBeenCalled();
  });

  it('returns the full DB permission catalog for super admins without querying grants', async () => {
    await expect(service.grantedPermissionSet(user([EventManagerKeycloakRole.SuperAdmin]))).resolves.toEqual(
      new Set(EVENT_MANAGER_PERMISSION_CATALOG),
    );
    expect(activeScopes).not.toHaveBeenCalled();
  });

  it('evaluates every catalog permission as granted for super admins without querying grants', async () => {
    await expect(
      service.evaluatePermissions(user([EventManagerKeycloakRole.SuperAdmin]), EVENT_MANAGER_PERMISSION_CATALOG),
    ).resolves.toEqual(EVENT_MANAGER_PERMISSION_CATALOG);
    expect(activeScopes).not.toHaveBeenCalled();
  });

  it('authorizes global DB grants', async () => {
    activeScopes.mockResolvedValue([
      grant({ permission: Permission.Event.Read, scope: EventManagerPermissionScope.GLOBAL }),
    ]);

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.Event.Read]),
    ).resolves.toBeUndefined();
  });

  it('fails closed when required permission names are invalid', async () => {
    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), ['event#reed']),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(activeScopes).not.toHaveBeenCalled();
  });

  it('fails closed when guard context is built with invalid permission names', () => {
    expect(() => service.buildResourceContext({ id: 'event-1' }, ['event#reed'])).toThrow(ForbiddenException);
  });

  it('only considers grants inside their validity window', async () => {
    activeScopes.mockResolvedValue([
      grant({ permission: Permission.Event.Read, scope: EventManagerPermissionScope.GLOBAL }),
    ]);

    await service.evaluatePermissions(user([EventManagerKeycloakRole.Access]), [Permission.Event.Read]);

    expect(activeScopes).toHaveBeenCalledWith(prisma, 'user-1', [Permission.Event.Read]);
  });

  it('only returns global grants from global permission evaluation', async () => {
    activeScopes.mockResolvedValue([
      grant({ permission: Permission.Event.Read, scope: EventManagerPermissionScope.EVENT, eventId: 'event-1' }),
      grant({ permission: Permission.Receipt.Read, scope: EventManagerPermissionScope.GLOBAL }),
    ]);

    await expect(
      service.evaluateGlobalPermissions(user([EventManagerKeycloakRole.Access]), [
        Permission.Event.Read,
        Permission.Receipt.Read,
      ]),
    ).resolves.toEqual([Permission.Receipt.Read]);
  });

  it('does not surface scoped grants for global-only permissions', async () => {
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.PermissionGrant.Update,
        scope: EventManagerPermissionScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
      grant({
        permission: Permission.PermissionGrant.Read,
        scope: EventManagerPermissionScope.GLOBAL,
      }),
    ]);

    await expect(
      service.evaluatePermissions(user([EventManagerKeycloakRole.Access]), [
        Permission.PermissionGrant.Update,
        Permission.PermissionGrant.Read,
      ]),
    ).resolves.toEqual([Permission.PermissionGrant.Read]);
  });

  it('builds the effective permission set from active DB grants only', async () => {
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.Event.Read,
        scope: EventManagerPermissionScope.EVENT,
        eventId: 'event-1',
      }),
      grant({
        permission: Permission.PermissionGrant.Update,
        scope: EventManagerPermissionScope.EVENT,
        eventId: 'event-1',
      }),
      grant({
        permission: Permission.PermissionGrant.Read,
        scope: EventManagerPermissionScope.GLOBAL,
      }),
      {
        permission: 'unknown#permission',
        scope: EventManagerPermissionScope.GLOBAL,
        eventId: null,
        majorEventId: null,
        eventGroupId: null,
      },
    ]);

    await expect(service.grantedPermissionSet(user([EventManagerKeycloakRole.Access]))).resolves.toEqual(
      new Set([Permission.Event.Read, Permission.PermissionGrant.Read]),
    );
  });

  it('matches major-event scoped grants through an event context', async () => {
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.Event.Update,
        scope: EventManagerPermissionScope.MAJOR_EVENT,
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

  it('does not authorize a tournament from one of its child event groups', async () => {
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.SportsTournament.Read,
        scope: EventManagerPermissionScope.EVENT_GROUP,
        eventGroupId: 'group-1',
      }),
    ]);
    prisma.sportsTournament.findUnique.mockResolvedValue({
      majorEventId: 'major-1',
      categories: [{ eventGroupId: 'group-1', matches: [] }],
    });

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.SportsTournament.Read], {
        sportsTournamentId: 'tournament-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies scoped grants when the operation has no matching target', async () => {
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.Event.Update,
        scope: EventManagerPermissionScope.EVENT,
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
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.MajorEvent.Read,
        scope: EventManagerPermissionScope.MAJOR_EVENT,
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
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.MajorEvent.Read,
        scope: EventManagerPermissionScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
      grant({
        permission: Permission.MajorEvent.Read,
        scope: EventManagerPermissionScope.MAJOR_EVENT,
        majorEventId: 'major-2',
      }),
      grant({
        permission: Permission.MajorEvent.Read,
        scope: EventManagerPermissionScope.EVENT,
        eventId: 'event-1',
      }),
    ]);

    await expect(
      service.accessibleMajorEventIds(user([EventManagerKeycloakRole.Access]), Permission.MajorEvent.Read),
    ).resolves.toEqual(new Set(['major-1', 'major-2']));
  });

  it('returns scoped event targets for event resolver filtering', async () => {
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.Event.Read,
        scope: EventManagerPermissionScope.EVENT,
        eventId: 'event-1',
      }),
      grant({
        permission: Permission.Event.Read,
        scope: EventManagerPermissionScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
      grant({
        permission: Permission.Event.Read,
        scope: EventManagerPermissionScope.EVENT_GROUP,
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
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.EventGroup.Read,
        scope: EventManagerPermissionScope.EVENT_GROUP,
        eventGroupId: 'group-1',
      }),
      grant({
        permission: Permission.EventGroup.Read,
        scope: EventManagerPermissionScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
    ]);

    await expect(
      service.accessibleEventGroupIds(user([EventManagerKeycloakRole.Access]), Permission.EventGroup.Read),
    ).resolves.toEqual(new Set(['group-1']));
  });

  it('returns empty, unrestricted, and globally granted event-group scopes', async () => {
    await expect(service.accessibleEventGroupIds(undefined, Permission.EventGroup.Read)).resolves.toEqual(new Set());
    await expect(
      service.accessibleEventGroupIds(user([EventManagerKeycloakRole.SuperAdmin]), Permission.EventGroup.Read),
    ).resolves.toBeNull();

    activeScopes.mockResolvedValue([
      grant({ permission: Permission.EventGroup.Read, scope: EventManagerPermissionScope.GLOBAL }),
    ]);
    await expect(
      service.accessibleEventGroupIds(user([EventManagerKeycloakRole.Access]), Permission.EventGroup.Read),
    ).resolves.toBeNull();
  });

  it('checks frozen-resource overrides through normal permission evaluation', async () => {
    await expect(service.canOverrideFrozenResource(undefined, Permission.Event.Update)).resolves.toBe(false);
    await expect(
      service.canOverrideFrozenResource(user([EventManagerKeycloakRole.SuperAdmin]), Permission.Event.Update, {
        eventId: 'event-1',
      }),
    ).resolves.toBe(true);
  });

  it('resolves generic subscription ids when subscription permissions are required with related resources', async () => {
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.Subscription.Update,
        scope: EventManagerPermissionScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
      grant({
        permission: Permission.Event.Read,
        scope: EventManagerPermissionScope.MAJOR_EVENT,
        majorEventId: 'major-1',
      }),
      grant({
        permission: Permission.MajorEvent.Read,
        scope: EventManagerPermissionScope.MAJOR_EVENT,
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
      service.assertPermissions(
        user([EventManagerKeycloakRole.Access]),
        [Permission.Subscription.Update, Permission.Event.Read, Permission.MajorEvent.Read],
        context,
      ),
    ).resolves.toBeUndefined();
    expect(context.subscriptionId).toBe('subscription-1');
  });

  it('matches event-group scoped grants through an event-group subscription', async () => {
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.Subscription.Read,
        scope: EventManagerPermissionScope.EVENT_GROUP,
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
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.Event.Update,
        scope: EventManagerPermissionScope.EVENT_GROUP,
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

  it('collects explicit nested resource identifiers without overwriting earlier targets', () => {
    const context = service.buildResourceContext(
      {
        eventId: 'event-1',
        nested: {
          eventId: 'event-ignored',
          majorEventId: 'major-1',
          eventGroupId: 'group-1',
          folderId: 'folder-1',
          subscriptionId: 'subscription-1',
          receiptId: 'receipt-1',
          certificateConfigId: 'config-1',
          certificateId: 'certificate-1',
          eventFormId: 'form-1',
          eventFormLinkId: 'link-1',
          eventFormResponseId: 'response-1',
          receiptValidationActionId: 'validation-1',
          sportsTournamentId: 'tournament-1',
          sportsCategoryId: 'category-1',
          sportsTeamId: 'team-1',
          sportsRegistrationId: 'registration-1',
          sportsMatchId: 'match-1',
          sportsOfficialAssignmentId: 'official-1',
          sportsTeamChangeRequestId: 'change-1',
          sportsTeamRepresentativeId: 'representative-1',
          sportsPlayerApplicationId: 'application-1',
          sportsMatchActionId: 'action-1',
          sportsMatchRosterId: 'roster-1',
        },
      },
      [Permission.Event.Read],
    );

    expect(context).toEqual(
      expect.objectContaining({
        eventId: 'event-1',
        majorEventId: 'major-1',
        eventGroupId: 'group-1',
        folderId: 'folder-1',
        subscriptionId: 'subscription-1',
        receiptId: 'receipt-1',
        certificateConfigId: 'config-1',
        certificateId: 'certificate-1',
        eventFormId: 'form-1',
        eventFormLinkId: 'link-1',
        eventFormResponseId: 'response-1',
        receiptValidationActionId: 'validation-1',
        sportsTournamentId: 'tournament-1',
        sportsCategoryId: 'category-1',
        sportsTeamId: 'team-1',
        sportsRegistrationId: 'registration-1',
        sportsMatchId: 'match-1',
        sportsOfficialAssignmentId: 'official-1',
        sportsTeamChangeRequestId: 'change-1',
        sportsTeamRepresentativeId: 'representative-1',
        sportsPlayerApplicationId: 'application-1',
        sportsMatchActionId: 'action-1',
        sportsMatchRosterId: 'roster-1',
      }),
    );
  });

  it.each([
    [Permission.SportsTournament.Update, { tournamentId: 'tournament-1' }, 'sportsTournamentId', 'tournament-1'],
    [Permission.SportsCategory.Update, { categoryId: 'category-1' }, 'sportsCategoryId', 'category-1'],
    [Permission.SportsTeam.Update, { teamId: 'team-1' }, 'sportsTeamId', 'team-1'],
    [
      Permission.SportsRegistration.Update,
      { registrationId: 'registration-1' },
      'sportsRegistrationId',
      'registration-1',
    ],
    [Permission.SportsMatch.Update, { matchId: 'match-1' }, 'sportsMatchId', 'match-1'],
    [
      Permission.SportsOfficial.Update,
      { officialAssignmentId: 'official-1' },
      'sportsOfficialAssignmentId',
      'official-1',
    ],
  ] as const)('maps generic sports aliases for %s', (permission, args, key, expected) => {
    const context = service.buildResourceContext(args, [permission]);
    expect(context[key]).toBe(expected);
  });

  it('resolves certificate target ids for scoped certificate config grants', async () => {
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.CertificateConfig.Read,
        scope: EventManagerPermissionScope.EVENT_GROUP,
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
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.Certificate.Issue,
        scope: EventManagerPermissionScope.MAJOR_EVENT,
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
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.Certificate.Read,
        scope: EventManagerPermissionScope.EVENT,
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

  it('resolves event-form ownership and linked targets for scoped form grants', async () => {
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.EventForm.Results,
        scope: EventManagerPermissionScope.EVENT,
        eventId: 'owner-event',
      }),
      grant({
        permission: Permission.EventForm.Results,
        scope: EventManagerPermissionScope.MAJOR_EVENT,
        majorEventId: 'linked-major',
      }),
    ]);
    prisma.eventForm.findFirst.mockResolvedValue({
      ownerEventId: 'owner-event',
      ownerMajorEventId: null,
      links: [
        {
          eventId: 'linked-event',
          majorEventId: 'linked-major',
        },
      ],
    });
    prisma.event.findUnique
      .mockResolvedValueOnce({
        majorEventId: 'owner-major',
        eventGroupId: null,
      })
      .mockResolvedValueOnce({
        majorEventId: null,
        eventGroupId: 'linked-group',
      });

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.EventForm.Results], {
        eventFormId: 'form-1',
      }),
    ).resolves.toBeUndefined();

    expect(prisma.eventForm.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'form-1',
          deletedAt: null,
        },
      }),
    );
  });

  it('resolves form-link and form-response targets before matching scoped form grants', async () => {
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.EventForm.Update,
        scope: EventManagerPermissionScope.EVENT_GROUP,
        eventGroupId: 'group-1',
      }),
    ]);
    prisma.eventFormLink.findFirst.mockResolvedValue({
      eventId: 'event-1',
      majorEventId: null,
      formId: 'form-1',
    });
    prisma.eventFormResponse.findUnique.mockResolvedValue({
      formId: 'form-1',
      eventId: 'event-1',
      majorEventId: null,
    });
    prisma.eventForm.findFirst.mockResolvedValue({
      ownerEventId: null,
      ownerMajorEventId: null,
      links: [],
    });
    prisma.event.findUnique.mockResolvedValue({
      majorEventId: null,
      eventGroupId: 'group-1',
    });

    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.EventForm.Update], {
        eventFormLinkId: 'link-1',
      }),
    ).resolves.toBeUndefined();
    await expect(
      service.assertPermissions(user([EventManagerKeycloakRole.Access]), [Permission.EventForm.Update], {
        eventFormResponseId: 'response-1',
      }),
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
      isPubliclyListed: true,
      shouldCollectAttendance: true,
    });

    await expect(
      service.assertAttendanceCollectorForEvent('event-1', 'person-1', {
        enforceCollectionWindow: true,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects attendance collection for unpublished or closed collection windows', async () => {
    prisma.event.findUnique.mockResolvedValueOnce({
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      deletedAt: null,
      isPubliclyListed: false,
      shouldCollectAttendance: true,
    });

    await expect(
      service.assertAttendanceCollectorForEvent('event-1', 'person-1', {
        enforceCollectionWindow: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    prisma.eventAttendanceCollector.findUnique.mockResolvedValue({
      eventId: 'event-1',
    });
    prisma.event.findUnique.mockResolvedValueOnce({
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 12 * 60 * 60 * 1000),
      deletedAt: null,
      isPubliclyListed: true,
      shouldCollectAttendance: true,
    });

    await expect(
      service.assertAttendanceCollectorForEvent('event-1', 'person-1', {
        enforceCollectionWindow: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows attendance managers to collect without an explicit collector row', async () => {
    prisma.event.findUnique
      .mockResolvedValueOnce({
        startDate: new Date(Date.now() - 60_000),
        endDate: new Date(Date.now() + 60_000),
        deletedAt: null,
        isPubliclyListed: false,
        shouldCollectAttendance: true,
      })
      .mockResolvedValueOnce({
        majorEventId: null,
        eventGroupId: null,
      });
    activeScopes.mockResolvedValue([
      grant({
        permission: Permission.EventAttendance.Collect,
        scope: EventManagerPermissionScope.EVENT,
        eventId: 'event-1',
      }),
    ]);

    await expect(
      service.assertAttendanceCollectorForEvent('event-1', 'person-1', {
        enforceCollectionWindow: true,
        user: user([EventManagerKeycloakRole.Access]),
      }),
    ).resolves.toBeUndefined();
  });

  it('allows an active sports official to collect attendance for the assigned match', async () => {
    prisma.event.findUnique.mockResolvedValue({
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      deletedAt: null,
      isPubliclyListed: false,
      shouldCollectAttendance: true,
      sportsMatch: {
        id: 'match-1',
        categoryId: 'category-1',
        category: { tournamentId: 'tournament-1' },
      },
    });
    prisma.sportsOfficialAssignment.findFirst.mockResolvedValue({ id: 'official-1' });

    await expect(
      service.assertAttendanceCollectorForEvent('event-1', 'person-1', { enforceCollectionWindow: true }),
    ).resolves.toBeUndefined();
    expect(prisma.sportsOfficialAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          personId: 'person-1',
          tournamentId: 'tournament-1',
          OR: [
            { matchId: 'match-1' },
            { matchId: null, categoryId: 'category-1' },
            { matchId: null, categoryId: null },
          ],
        }),
      }),
    );
  });

  it.each([
    [null, 'missing event'],
    [
      {
        startDate: new Date(Date.now() - 60_000),
        endDate: new Date(Date.now() + 60_000),
        deletedAt: new Date(),
        isPubliclyListed: true,
        shouldCollectAttendance: true,
      },
      'deleted event',
    ],
    [
      {
        startDate: new Date(Date.now() - 60_000),
        endDate: new Date(Date.now() + 60_000),
        deletedAt: null,
        isPubliclyListed: true,
        shouldCollectAttendance: false,
      },
      'disabled collection',
    ],
  ])('rejects attendance collection for a %s', async (event) => {
    prisma.event.findUnique.mockResolvedValue(event);
    await expect(service.assertAttendanceCollectorForEvent('event-1', 'person-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows super-admins to collect without an explicit collector row or DB grant', async () => {
    prisma.eventAttendanceCollector.findUnique.mockResolvedValue(null);
    prisma.event.findUnique.mockResolvedValue({
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      deletedAt: null,
      isPubliclyListed: false,
      shouldCollectAttendance: true,
    });

    await expect(
      service.assertAttendanceCollectorForEvent('event-1', 'person-1', {
        enforceCollectionWindow: true,
        user: user([EventManagerKeycloakRole.SuperAdmin]),
      }),
    ).resolves.toBeUndefined();
    expect(activeScopes).not.toHaveBeenCalled();
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
    eventGroup: {
      findMany: jest.fn().mockResolvedValue([]),
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
    eventForm: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    eventFormLink: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    eventFormResponse: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    sportsTournament: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    sportsOfficialAssignment: {
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
  scope: EventManagerPermissionScope;
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
