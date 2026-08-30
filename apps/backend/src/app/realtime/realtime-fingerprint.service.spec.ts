import { RealtimeFingerprintService } from './realtime-fingerprint.service';

describe('RealtimeFingerprintService', () => {
  it('covers the role and sports records used by current-user projections', async () => {
    const revision = { _count: 1, _max: { updatedAt: new Date(), deletedAt: null } };
    const aggregate = () => ({ aggregate: jest.fn().mockResolvedValue(revision) });
    const prisma = {
      eventAttendance: aggregate(),
      eventSubscription: { ...aggregate(), findMany: jest.fn().mockResolvedValue([]) },
      eventGroupSubscription: aggregate(),
      majorEventSubscription: aggregate(),
      certificate: aggregate(),
      sportsPlayerApplication: aggregate(),
      sportsTournamentParticipant: aggregate(),
      eventLecturer: aggregate(),
      eventAttendanceCollector: aggregate(),
      sportsTeamRepresentative: aggregate(),
      sportsOfficialAssignment: aggregate(),
      sportsTeamMember: aggregate(),
      sportsRegistrationMember: aggregate(),
      sportsMatchRosterEntry: aggregate(),
      eventManagerRoleAssignment: aggregate(),
      eventManagerRoleAssignmentScope: aggregate(),
      eventManagerPermissionGroupMember: aggregate(),
    };
    const service = new RealtimeFingerprintService(prisma as never);

    await expect(service.currentUser('person-1')).resolves.toEqual(
      expect.objectContaining({
        type: 'CURRENT_USER_DATA_INVALIDATED',
        minute: expect.any(Number),
        eventSubscriptionGroups: expect.any(String),
        lecturers: revision,
        attendanceCollectors: revision,
        teamRepresentatives: revision,
        officialAssignments: revision,
        teamMemberships: revision,
        registrationMemberships: revision,
        rosterEntries: revision,
        roleAssignments: revision,
        roleAssignmentScopes: revision,
        permissionGroupMemberships: revision,
      }),
    );
    expect(prisma.sportsTeamMember.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { participant: { personId: 'person-1' } } }),
    );
    expect(prisma.eventManagerRoleAssignmentScope.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assignment: {
            OR: [{ personId: 'person-1' }, { group: { members: { some: { personId: 'person-1' } } } }],
          },
        },
      }),
    );
  });

  it('tracks grouping and lecturer changes in event-subscription revisions', async () => {
    const directSubscriptions = { _count: 4, _max: { createdAt: null, deletedAt: null } };
    const selections = { _count: 3, _max: { createdAt: null, deletedAt: null } };
    const rankedSubscriptions = { _count: 2, _max: { updatedAt: null, deletedAt: null } };
    const prisma = {
      eventSubscription: {
        aggregate: jest.fn().mockResolvedValue(directSubscriptions),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'subscription-1', eventGroupSubscriptionId: null }])
          .mockResolvedValueOnce([
            { id: 'subscription-1', eventGroupSubscriptionId: 'group-subscription-1' },
          ]),
      },
      eventLecturer: { aggregate: jest.fn().mockResolvedValue({ _count: 1, _max: { createdAt: null } }) },
      majorEventSubscriptionEventSelection: { aggregate: jest.fn().mockResolvedValue(selections) },
      majorEventSubscription: { aggregate: jest.fn().mockResolvedValue(rankedSubscriptions) },
    };
    const service = new RealtimeFingerprintService(prisma as never);

    const standalone = await service.eventSubscriptions('event-1');
    const grouped = await service.eventSubscriptions('event-1');

    expect(standalone).toEqual({
      type: 'EVENT_SUBSCRIPTIONS_INVALIDATED',
      subscriptions: directSubscriptions,
      subscriptionGroups: expect.any(String),
      lecturers: { _count: 1, _max: { createdAt: null } },
      selections,
      rankedSubscriptions,
    });
    expect(grouped.subscriptionGroups).not.toBe(standalone.subscriptionGroups);

    expect(prisma.eventSubscription.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 'event-1' }, _count: true }),
    );
    expect(prisma.eventSubscription.findMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
      select: { id: true, eventGroupSubscriptionId: true },
      orderBy: { id: 'asc' },
    });
    expect(prisma.eventLecturer.aggregate).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
      _count: true,
      _max: { createdAt: true },
    });
    expect(prisma.majorEventSubscriptionEventSelection.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 'event-1' }, _count: true }),
    );
    expect(prisma.majorEventSubscription.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { selectedEvents: { some: { eventId: 'event-1' } } }, _count: true }),
    );
  });

  it('builds a major-event subscription revision across payments and sports membership', async () => {
    const prisma = {
      majorEventSubscription: { aggregate: jest.fn().mockResolvedValue({ _count: 1, _max: { updatedAt: null } }) },
      majorEventSubscriptionEventSelection: {
        aggregate: jest.fn().mockResolvedValue({ _count: 2, _max: { createdAt: null } }),
      },
      majorEventReceipt: { aggregate: jest.fn().mockResolvedValue({ _count: 3, _max: { updatedAt: null } }) },
      sportsPlayerApplication: {
        aggregate: jest.fn().mockResolvedValue({ _count: 4, _max: { updatedAt: null } }),
      },
      sportsTournamentParticipant: {
        aggregate: jest.fn().mockResolvedValue({ _count: 5, _max: { updatedAt: null } }),
      },
      sportsTeam: { aggregate: jest.fn().mockResolvedValue({ _count: 6, _max: { updatedAt: null } }) },
      sportsTeamMember: { aggregate: jest.fn().mockResolvedValue({ _count: 7, _max: { updatedAt: null } }) },
      sportsRegistrationMember: {
        aggregate: jest.fn().mockResolvedValue({ _count: 8, _max: { updatedAt: null } }),
      },
    };
    const service = new RealtimeFingerprintService(prisma as never);

    await expect(service.majorEventSubscriptions('major-1')).resolves.toEqual({
      type: 'MAJOR_EVENT_SUBSCRIPTIONS_INVALIDATED',
      subscriptions: { _count: 1, _max: { updatedAt: null } },
      selections: { _count: 2, _max: { createdAt: null } },
      receipts: { _count: 3, _max: { updatedAt: null } },
      applications: { _count: 4, _max: { updatedAt: null } },
      participants: { _count: 5, _max: { updatedAt: null } },
      teams: { _count: 6, _max: { updatedAt: null } },
      members: { _count: 7, _max: { updatedAt: null } },
      registrationMembers: { _count: 8, _max: { updatedAt: null } },
    });

    expect(prisma.majorEventSubscription.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { majorEventId: 'major-1' }, _count: true }),
    );
    expect(prisma.majorEventSubscriptionEventSelection.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { subscription: { majorEventId: 'major-1' } }, _count: true }),
    );
    expect(prisma.majorEventReceipt.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { subscription: { majorEventId: 'major-1' } }, _count: true }),
    );
    expect(prisma.sportsPlayerApplication.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tournament: { majorEventId: 'major-1' } }, _count: true }),
    );
    expect(prisma.sportsTournamentParticipant.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tournament: { majorEventId: 'major-1' } }, _count: true }),
    );
    expect(prisma.sportsTeam.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tournament: { majorEventId: 'major-1' } }, _count: true }),
    );
    expect(prisma.sportsTeamMember.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { participant: { tournament: { majorEventId: 'major-1' } } }, _count: true }),
    );
    expect(prisma.sportsRegistrationMember.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { registration: { category: { tournament: { majorEventId: 'major-1' } } } },
        _count: true,
      }),
    );
  });
});
