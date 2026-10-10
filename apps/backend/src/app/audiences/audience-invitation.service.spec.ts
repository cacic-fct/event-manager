import { AttendanceEligibility } from '@cacic-fct/shared-event-participation';
import {
  AudienceInvitationService,
  attendanceInvitationTarget,
  invitationFactForAttendance,
} from './audience-invitation.service';

describe('audience invitation attendance facts', () => {
  it('links a group invitation to an accessible child event instead of the major-event listing', async () => {
    const row = pendingInvitation();
    const groupInvitations = {
      findMany: jest.fn().mockResolvedValue([row]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      eventGroupAudienceInvitation: groupInvitations,
      eventGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1' }) },
      event: { findFirst: jest.fn().mockResolvedValue({ id: 'visible-child' }) },
    };
    const notifications = {
      mapPersonToRecipient: jest.fn(() => ({ subscriberId: 'person-1' })),
      notifyAudienceInvitation: jest.fn().mockResolvedValue(true),
    };
    const service = new AudienceInvitationService(prisma as never, notifications as never, { principalForStoredUser: jest.fn() } as never);
    await service.notifyInvited({ type: 'EVENT_GROUP', id: 'group-1', name: 'Grupo convidado' }, ['person-1']);
    expect(notifications.notifyAudienceInvitation).toHaveBeenCalledWith(expect.objectContaining({ actionUrl: '/event/visible-child' }));
    expect(prisma.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.any(Array) }) }));
  });
  it('accepts a direct, group, or major invitation for inherited INVITED_ONLY attendance', () => {
    const event = {
      id: 'event-1',
      eventGroupId: 'group-1',
      majorEventId: 'major-1',
      attendanceEligibility: null,
      eventGroup: { attendanceEligibility: AttendanceEligibility.INVITED_ONLY, deletedAt: null },
      majorEvent: { attendanceEligibility: AttendanceEligibility.INVITED_ONLY, deletedAt: null },
    };

    expect(attendanceInvitationTarget(event)).toEqual({ targetType: 'EVENT_GROUP', targetId: 'group-1' });
    expect(invitationFactForAttendance(event, { event: true, eventGroup: false, majorEvent: false })).toBe(true);
    expect(invitationFactForAttendance(event, { event: false, eventGroup: true, majorEvent: false })).toBe(true);
    expect(invitationFactForAttendance(event, { event: false, eventGroup: false, majorEvent: true })).toBe(true);
  });

  it('fails closed when INVITED_ONLY has no invitation fact', () => {
    const event = {
      id: 'event-1',
      eventGroupId: null,
      majorEventId: null,
      attendanceEligibility: AttendanceEligibility.INVITED_ONLY,
      eventGroup: null,
      majorEvent: null,
    };

    expect(invitationFactForAttendance(event)).toBe(false);
  });

  it('does not require invitation rows for non invited-only policies', () => {
    const event = {
      id: 'event-1',
      eventGroupId: null,
      majorEventId: null,
      attendanceEligibility: AttendanceEligibility.ANYONE,
      eventGroup: null,
      majorEvent: null,
    };

    expect(attendanceInvitationTarget(event)).toBeNull();
    expect(invitationFactForAttendance(event)).toBeUndefined();
  });

  it('does not list invitations or apply an invitation gate for explicit ANYONE attendance', async () => {
    const prisma = {
      eventAudienceInvitation: { findMany: jest.fn() },
      eventGroupAudienceInvitation: { findMany: jest.fn() },
      majorEventAudienceInvitation: { findMany: jest.fn() },
    };
    const service = new AudienceInvitationService(prisma as never);
    const event = {
      id: 'event-1',
      eventGroupId: 'group-1',
      majorEventId: 'major-1',
      attendanceEligibility: AttendanceEligibility.ANYONE,
      eventGroup: { attendanceEligibility: AttendanceEligibility.INVITED_ONLY, deletedAt: null },
      majorEvent: { attendanceEligibility: AttendanceEligibility.INVITED_ONLY, deletedAt: null },
    };

    await expect(service.listInvitedPeopleForAttendance(event, prisma as never)).resolves.toEqual([]);
    expect(prisma.eventAudienceInvitation.findMany).not.toHaveBeenCalled();
    expect(invitationFactForAttendance(event, { event: true, eventGroup: true, majorEvent: true })).toBeUndefined();
  });

  it('unions and deduplicates all invitation scopes for inherited INVITED_ONLY attendance', async () => {
    const prisma = {
      eventAudienceInvitation: {
        findMany: jest.fn().mockResolvedValue([
          { personId: 'person-event', person: { id: 'person-event', name: 'Event', email: null } },
          { personId: 'person-both', person: { id: 'person-both', name: 'Both', email: null } },
        ]),
      },
      eventGroupAudienceInvitation: {
        findMany: jest.fn().mockResolvedValue([
          { personId: 'person-group', person: { id: 'person-group', name: 'Group', email: null } },
          { personId: 'person-both', person: { id: 'person-both', name: 'Both', email: null } },
        ]),
      },
      majorEventAudienceInvitation: {
        findMany: jest.fn().mockResolvedValue([
          { personId: 'person-major', person: { id: 'person-major', name: 'Major', email: null } },
        ]),
      },
    };
    const service = new AudienceInvitationService(prisma as never);

    const result = await service.listInvitedPeopleForAttendance(
      {
        id: 'event-1',
        eventGroupId: 'group-1',
        majorEventId: 'major-1',
        attendanceEligibility: AttendanceEligibility.INVITED_ONLY,
        eventGroup: { attendanceEligibility: null, deletedAt: null },
        majorEvent: { attendanceEligibility: null, deletedAt: null },
      },
      prisma as never,
    );

    expect(result.map((invitation) => invitation.personId)).toEqual([
      'person-event',
      'person-both',
      'person-group',
      'person-major',
    ]);
    expect(result.find((invitation) => invitation.personId === 'person-both')?.person.name).toBe('Both');
  });

  it('retains a failed delivery for the bounded retry worker and marks it only after acknowledgement', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-13T12:00:00.000Z') });
    try {
      const row = pendingInvitation();
      const prisma = createRetryPrisma(row);
      const notifications = {
        mapPersonToRecipient: jest.fn(() => ({ subscriberId: 'person-1' })),
        notifyAudienceInvitation: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
      };
      const audiences = { principalForStoredUser: jest.fn() };
      const service = new AudienceInvitationService(prisma as never, notifications as never, audiences as never);

      await service.retryPendingNotifications();
      expect(row.notifiedAt).toBeNull();
      expect(row.notificationAttemptedAt).toEqual(new Date('2026-09-13T12:00:00.000Z'));
      expect(notifications.notifyAudienceInvitation).toHaveBeenCalledTimes(1);

      row.notificationAttemptedAt = new Date('2026-09-13T11:54:00.000Z');
      await service.retryPendingNotifications();
      expect(row.notifiedAt).toEqual(new Date('2026-09-13T12:00:00.000Z'));
      expect(notifications.notifyAudienceInvitation).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('leaves unpublished, ineligible, and revoked invitations pending without sending', async () => {
    const row = pendingInvitation();
    const prisma = createRetryPrisma(row);
    const notifications = {
      mapPersonToRecipient: jest.fn(() => ({ subscriberId: 'person-1' })),
      notifyAudienceInvitation: jest.fn().mockResolvedValue(true),
    };
    const audiences = { principalForStoredUser: jest.fn() };
    const service = new AudienceInvitationService(prisma as never, notifications as never, audiences as never);

    prisma.event.findFirst.mockResolvedValueOnce(null);
    await service.retryPendingNotifications();
    expect(notifications.notifyAudienceInvitation).not.toHaveBeenCalled();
    expect(row.notificationAttemptedAt).toEqual(expect.any(Date));

    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
    prisma.eventAudienceInvitation.findMany.mockResolvedValue([]);
    await service.retryPendingNotifications();
    expect(notifications.notifyAudienceInvitation).not.toHaveBeenCalled();
  });

  it('backs off an ineligible oldest row so a later eligible invitation is delivered', async () => {
    const ineligible = pendingInvitation('event-ineligible', 'person-ineligible');
    const eligible = pendingInvitation('event-eligible', 'person-eligible');
    const prisma = createRetryPrisma([ineligible, eligible]);
    prisma.event.findFirst.mockImplementation(async (args: { where?: { AND?: Array<{ id?: string }> } }) => {
      const eventId = args.where?.AND?.[0]?.id;
      return eventId === 'event-eligible' ? { id: eventId } : null;
    });
    const notifications = {
      mapPersonToRecipient: jest.fn((person: { id: string }) => ({ subscriberId: person.id })),
      notifyAudienceInvitation: jest.fn().mockResolvedValue(true),
    };
    const audiences = { principalForStoredUser: jest.fn() };
    const service = new AudienceInvitationService(prisma as never, notifications as never, audiences as never);

    await service.retryPendingNotifications();

    expect(ineligible.notificationAttemptedAt).toEqual(expect.any(Date));
    expect(ineligible.notifiedAt).toBeNull();
    expect(eligible.notifiedAt).toEqual(expect.any(Date));
    expect(notifications.notifyAudienceInvitation).toHaveBeenCalledTimes(1);
  });

  it('does not claim a replacement invitation when its persisted creation time changed after scan', async () => {
    const row = pendingInvitation();
    const replacementCreatedAt = new Date('2026-09-13T11:05:00.000Z');
    const prisma = createRetryPrisma(row);
    prisma.eventAudienceInvitation.updateMany.mockImplementationOnce(async () => {
      row.createdAt = replacementCreatedAt;
      return { count: 0 };
    });
    const notifications = {
      mapPersonToRecipient: jest.fn(() => ({ subscriberId: 'person-1' })),
      notifyAudienceInvitation: jest.fn().mockResolvedValue(true),
    };
    const audiences = { principalForStoredUser: jest.fn() };
    const service = new AudienceInvitationService(prisma as never, notifications as never, audiences as never);

    await service.retryPendingNotifications();

    expect(notifications.notifyAudienceInvitation).not.toHaveBeenCalled();
    expect(row.createdAt).toBe(replacementCreatedAt);
    expect(row.notificationAttemptedAt).toBeNull();
    expect(row.notifiedAt).toBeNull();
  });
});

function pendingInvitation(eventId = 'event-1', personId = 'person-1') {
  return {
    eventId,
    personId,
    createdAt: new Date('2026-09-13T11:00:00.000Z'),
    notifiedAt: null as Date | null,
    notificationAttemptedAt: null as Date | null,
    person: {
      id: personId,
      name: `Pessoa ${personId}`,
      email: 'person@example.com',
      phone: null,
      userId: null,
      user: null,
    },
    event: { id: eventId, name: 'Evento reservado' },
  };
}

function createRetryPrisma(input: ReturnType<typeof pendingInvitation> | Array<ReturnType<typeof pendingInvitation>>) {
  const rows = Array.isArray(input) ? input : [input];
  const prisma = {
    eventAudienceInvitation: {
      findMany: jest.fn().mockImplementation(async () => rows.map((row) => cloneInvitation(row))),
      updateMany: jest.fn().mockImplementation(async ({
        where,
        data,
      }: {
        where: { eventId?: string; personId?: string; createdAt?: Date };
        data: Record<string, unknown>;
      }) => {
        const row = rows.find(
          (candidate) =>
            candidate.eventId === where.eventId &&
            candidate.personId === where.personId &&
            (!where.createdAt || candidate.createdAt.getTime() === where.createdAt.getTime()),
        );
        if (!row) {
          return { count: 0 };
        }
        if ('notificationAttemptedAt' in data) {
          row.notificationAttemptedAt = data.notificationAttemptedAt as Date;
        }
        if ('notifiedAt' in data) {
          row.notifiedAt = data.notifiedAt as Date;
        }
        return { count: 1 };
      }),
    },
    eventGroupAudienceInvitation: { findMany: jest.fn().mockResolvedValue([]) },
    majorEventAudienceInvitation: { findMany: jest.fn().mockResolvedValue([]) },
    event: { findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }) },
  };
  return prisma;
}

function cloneInvitation(row: ReturnType<typeof pendingInvitation>) {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    person: { ...row.person },
    event: { ...row.event },
  };
}
