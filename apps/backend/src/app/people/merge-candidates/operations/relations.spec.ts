import { moveRelations } from './relations';

describe('merge candidate relation movement', () => {
  it('moves non-duplicate relation rows and records a rollback snapshot', async () => {
    const tx = createTransaction();
    const firstDate = new Date('2026-05-21T10:00:00.000Z');
    const secondDate = new Date('2026-05-21T11:00:00.000Z');

    tx.eventAttendance.findMany
      .mockResolvedValueOnce([
        { eventId: 'event-new', attendedAt: firstDate, createdAt: firstDate, createdById: 'actor-1' },
        { eventId: 'event-existing', attendedAt: secondDate, createdAt: secondDate, createdById: null },
      ])
      .mockResolvedValueOnce([{ eventId: 'event-existing' }]);
    tx.eventLecturer.findMany
      .mockResolvedValueOnce([
        { eventId: 'lecture-new', createdAt: firstDate, createdById: 'actor-2' },
        { eventId: 'lecture-existing', createdAt: secondDate, createdById: null },
      ])
      .mockResolvedValueOnce([{ eventId: 'lecture-existing' }]);
    tx.eventSubscription.findMany
      .mockResolvedValueOnce([{ id: 'event-subscription-1', eventId: 'event-new' }])
      .mockResolvedValueOnce([]);
    tx.eventGroupSubscription.findMany
      .mockResolvedValueOnce([{ id: 'group-subscription-1', eventGroupId: 'group-new' }])
      .mockResolvedValueOnce([]);
    tx.majorEventSubscription.findMany
      .mockResolvedValueOnce([{ id: 'major-subscription-1', majorEventId: 'major-new' }])
      .mockResolvedValueOnce([]);

    await expect(moveRelations(tx as never, 'target-person', 'source-person')).resolves.toEqual({
      sourceAttendances: [
        {
          eventId: 'event-new',
          attendedAt: '2026-05-21T10:00:00.000Z',
          createdAt: '2026-05-21T10:00:00.000Z',
          createdById: 'actor-1',
        },
        {
          eventId: 'event-existing',
          attendedAt: '2026-05-21T11:00:00.000Z',
          createdAt: '2026-05-21T11:00:00.000Z',
          createdById: null,
        },
      ],
      sourceLectures: [
        {
          eventId: 'lecture-new',
          createdAt: '2026-05-21T10:00:00.000Z',
          createdById: 'actor-2',
        },
        {
          eventId: 'lecture-existing',
          createdAt: '2026-05-21T11:00:00.000Z',
          createdById: null,
        },
      ],
      insertedAttendanceEventIds: ['event-new'],
      insertedLectureEventIds: ['lecture-new'],
      movedEventSubscriptionIds: ['event-subscription-1'],
      movedEventGroupSubscriptionIds: ['group-subscription-1'],
      movedMajorEventSubscriptionIds: ['major-subscription-1'],
      movedRoleAssignmentIds: [],
      archivedRoleAssignmentIds: [],
      movedPermissionGroupMembershipIds: [],
      archivedPermissionGroupMembershipIds: [],
      roleAssignmentSnapshots: [],
      roleAssignmentScopeSnapshots: [],
      permissionGroupMembershipSnapshots: [],
    });

    expect(tx.eventAttendance.createMany).toHaveBeenCalledWith({
      data: [
        {
          personId: 'target-person',
          eventId: 'event-new',
          attendedAt: firstDate,
          createdAt: firstDate,
          createdById: 'actor-1',
        },
      ],
      skipDuplicates: true,
    });
    expect(tx.eventLecturer.createMany).toHaveBeenCalledWith({
      data: [
        {
          personId: 'target-person',
          eventId: 'lecture-new',
          createdAt: firstDate,
          createdById: 'actor-2',
        },
      ],
      skipDuplicates: true,
    });
    expect(tx.eventAttendance.deleteMany).toHaveBeenCalledWith({ where: { personId: 'source-person' } });
    expect(tx.eventLecturer.deleteMany).toHaveBeenCalledWith({ where: { personId: 'source-person' } });
    expect(tx.eventSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['event-subscription-1'] } },
      data: { personId: 'target-person' },
    });
  });

  it('skips writes when there are no source relations', async () => {
    const tx = createTransaction();

    await expect(moveRelations(tx as never, 'target-person', 'source-person')).resolves.toEqual({
      sourceAttendances: [],
      sourceLectures: [],
      insertedAttendanceEventIds: [],
      insertedLectureEventIds: [],
      movedEventSubscriptionIds: [],
      movedEventGroupSubscriptionIds: [],
      movedMajorEventSubscriptionIds: [],
      movedRoleAssignmentIds: [],
      archivedRoleAssignmentIds: [],
      movedPermissionGroupMembershipIds: [],
      archivedPermissionGroupMembershipIds: [],
      roleAssignmentSnapshots: [],
      roleAssignmentScopeSnapshots: [],
      permissionGroupMembershipSnapshots: [],
    });

    expect(tx.eventAttendance.createMany).not.toHaveBeenCalled();
    expect(tx.eventAttendance.deleteMany).not.toHaveBeenCalled();
    expect(tx.eventSubscription.updateMany).not.toHaveBeenCalled();
  });

  it('moves unique permission relations and archives merge duplicates without deleting audit history', async () => {
    const tx = createTransaction();
    tx.eventManagerRoleAssignment.findMany.mockResolvedValue([
      { id: 'assignment-move', roleId: 'role-1' },
      { id: 'assignment-conflict', roleId: 'role-2' },
    ]);
    tx.eventManagerRoleAssignment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'target-assignment' });
    tx.eventManagerPermissionGroupMember.findMany.mockResolvedValue([
      { id: 'membership-move', groupId: 'group-1' },
      { id: 'membership-conflict', groupId: 'group-2' },
    ]);
    tx.eventManagerPermissionGroupMember.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'target-membership' });

    await expect(moveRelations(tx as never, 'target-person', 'source-person')).resolves.toEqual(
      expect.objectContaining({
        movedRoleAssignmentIds: ['assignment-move'],
        archivedRoleAssignmentIds: ['assignment-conflict'],
        movedPermissionGroupMembershipIds: ['membership-move'],
        archivedPermissionGroupMembershipIds: ['membership-conflict'],
      }),
    );
    expect(tx.eventManagerRoleAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assignment-move' },
      data: { personId: 'target-person' },
    });
    expect(tx.eventManagerRoleAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'assignment-conflict' },
        data: expect.objectContaining({ archivedReason: 'PERSON_MERGED' }),
      }),
    );
  });

  it('preserves disjoint assignment windows as separate active relations', async () => {
    const tx = createTransaction();
    const sourceAssignment = {
      id: 'source-assignment',
      roleId: 'role-1',
      validFrom: new Date('2026-06-15T00:00:00.000Z'),
      validUntil: new Date('2026-07-01T00:00:00.000Z'),
      unlimited: false,
      scopes: [
        {
          id: 'source-scope',
          scope: 'EVENT',
          eventId: 'event-source',
          majorEventId: null,
          eventGroupId: null,
          validFrom: null,
          validUntil: null,
          unlimited: true,
        },
      ],
    };
    tx.eventManagerRoleAssignment.findMany.mockResolvedValue([sourceAssignment]);
    tx.eventManagerRoleAssignment.findFirst.mockResolvedValue(null);

    await moveRelations(tx as never, 'target-person', 'source-person');

    expect(tx.eventManagerRoleAssignment.update).toHaveBeenCalledWith({
      where: { id: 'source-assignment' },
      data: { personId: 'target-person' },
    });
    expect(tx.eventManagerRoleAssignmentScope.update).not.toHaveBeenCalled();
  });
});

function createTransaction() {
  return {
    eventAttendance: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    eventLecturer: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    eventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    eventGroupSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    majorEventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    eventManagerRoleAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    eventManagerRoleAssignmentScope: {
      update: jest.fn(),
    },
    eventManagerPermissionGroupMember: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
  };
}
