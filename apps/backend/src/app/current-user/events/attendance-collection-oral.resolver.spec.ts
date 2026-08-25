import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventAttendanceStatus } from '@prisma/client';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import {
  findAttendanceOralRosterPersonIds,
  getAttendanceOralRoster,
  isOnAttendanceOralRoster,
} from './attendance-collection-feed';
import { CurrentUserAttendanceCollectionResolver } from './attendance-collection.resolver';
import {
  notifySportsMatchAttendanceMutation,
  startSportsMatchCheckInFromAthleteAttendance,
} from '../../sports/operations/sports-match-attendance';

jest.mock('./attendance-collection-feed', () => ({
  findAttendanceOralRosterPersonIds: jest.fn(),
  getAttendanceOralRoster: jest.fn(),
  getAttendanceScannerFeed: jest.fn(),
  isOnAttendanceOralRoster: jest.fn(),
}));

jest.mock('../../sports/operations/sports-match-attendance', () => ({
  notifySportsMatchAttendanceMutation: jest.fn(),
  startSportsMatchCheckInFromAthleteAttendance: jest.fn(),
}));

describe('CurrentUserAttendanceCollectionResolver oral attendance operations', () => {
  const actor = { sub: 'collector-user' };
  const context = { req: { user: actor } };
  const currentUserContext = {
    requireCurrentPerson: jest.fn(),
    getAuthenticatedUser: jest.fn(),
  };
  const authorizationPolicy = { assertAttendanceCollectorForEvent: jest.fn() };
  const eventAttendance = { findUnique: jest.fn(), upsert: jest.fn() };
  const prisma = {
    event: { findUnique: jest.fn() },
    eventAttendance,
    $transaction: jest.fn(async (operation: (tx: { eventAttendance: typeof eventAttendance }) => Promise<unknown>) =>
      operation({ eventAttendance }),
    ),
  };
  const attendanceCategories = { refreshForAttendance: jest.fn() };
  const frozenResources = { assertEventMutable: jest.fn() };
  const auditLog = { record: jest.fn(), buildCompositeEntityId: jest.fn(() => 'person:event') };
  const dashboardInsights = { invalidateCachedInsights: jest.fn() };
  const sportsMutationEvents = { publishAttendanceMutation: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    currentUserContext.requireCurrentPerson.mockResolvedValue({ id: 'collector-person' });
    currentUserContext.getAuthenticatedUser.mockReturnValue(actor);
    authorizationPolicy.assertAttendanceCollectorForEvent.mockResolvedValue(undefined);
    prisma.event.findUnique.mockResolvedValue({ shouldAllowOralAttendance: true });
    attendanceCategories.refreshForAttendance.mockResolvedValue(undefined);
    frozenResources.assertEventMutable.mockResolvedValue(undefined);
    auditLog.record.mockResolvedValue(undefined);
    dashboardInsights.invalidateCachedInsights.mockResolvedValue(undefined);
    jest.mocked(isOnAttendanceOralRoster).mockResolvedValue(true);
    jest.mocked(findAttendanceOralRosterPersonIds).mockResolvedValue(new Set(['person-1', 'person-2']));
    jest.mocked(startSportsMatchCheckInFromAthleteAttendance).mockResolvedValue(false);
    jest.mocked(notifySportsMatchAttendanceMutation).mockResolvedValue(undefined);
  });

  it('authorizes the collector and verifies oral attendance is enabled before loading the complete roster', async () => {
    const roster = [{ personId: 'person-1', status: null }];
    jest.mocked(getAttendanceOralRoster).mockResolvedValueOnce(roster as never);

    await expect(resolver().currentUserAttendanceOralRoster('event-1', context as never)).resolves.toBe(roster);
    expect(currentUserContext.requireCurrentPerson).toHaveBeenCalledWith(context);
    expect(authorizationPolicy.assertAttendanceCollectorForEvent).toHaveBeenCalledWith('event-1', 'collector-person', {
      enforceCollectionWindow: true,
      user: actor,
    });
    expect(prisma.event.findUnique).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      select: { shouldAllowOralAttendance: true },
    });
    expect(getAttendanceOralRoster).toHaveBeenCalledWith(prisma, 'event-1');
  });

  it('does not expose the oral roster when oral attendance is disabled', async () => {
    prisma.event.findUnique.mockResolvedValueOnce({ shouldAllowOralAttendance: false });

    await expect(resolver().currentUserAttendanceOralRoster('event-1', context as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(getAttendanceOralRoster).not.toHaveBeenCalled();
  });

  it('records one oral decision with immutable collector attribution and invalidates insights', async () => {
    const collectedAt = new Date(publicFixtureDateFromNow());
    const attendance = {
      id: 'attendance-1',
      eventId: 'event-1',
      personId: 'person-1',
      status: EventAttendanceStatus.PRESENT,
    };
    eventAttendance.findUnique.mockResolvedValueOnce(null);
    eventAttendance.upsert.mockResolvedValueOnce(attendance);
    jest.mocked(startSportsMatchCheckInFromAthleteAttendance).mockResolvedValueOnce(true);

    await expect(
      resolver().collectCurrentUserOralAttendance(
        {
          eventId: 'event-1',
          personId: 'person-1',
          status: EventAttendanceStatus.PRESENT,
          collectedAt,
          collectedByUserId: 'collector-user',
          location: { latitude: -22.1, longitude: -51.4, accuracyMeters: 8 },
        },
        context as never,
      ),
    ).resolves.toBe(attendance);

    expect(frozenResources.assertEventMutable).toHaveBeenCalledWith('event-1', actor, 'edit');
    expect(eventAttendance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId_eventId: { personId: 'person-1', eventId: 'event-1' } },
        create: expect.objectContaining({
          createdById: 'collector-user',
          committedById: 'collector-user',
          status: EventAttendanceStatus.PRESENT,
          attendedAt: collectedAt,
          collectedLatitude: -22.1,
          collectedLongitude: -51.4,
          collectedAccuracyMeters: 8,
        }),
      }),
    );
    expect(attendanceCategories.refreshForAttendance).toHaveBeenCalledWith('person-1', 'event-1', expect.anything());
    expect(notifySportsMatchAttendanceMutation).toHaveBeenCalledWith(sportsMutationEvents, attendance);
    expect(dashboardInsights.invalidateCachedInsights).toHaveBeenCalledTimes(1);
  });

  it('rejects disabled oral attendance, non-roster people, and forged collector identity before writes', async () => {
    prisma.event.findUnique.mockResolvedValueOnce({ shouldAllowOralAttendance: false });
    await expect(resolver().collectCurrentUserOralAttendance(input(), context as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.event.findUnique.mockResolvedValueOnce({ shouldAllowOralAttendance: true });
    jest.mocked(isOnAttendanceOralRoster).mockResolvedValueOnce(false);
    await expect(resolver().collectCurrentUserOralAttendance(input(), context as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.event.findUnique.mockResolvedValueOnce({ shouldAllowOralAttendance: true });
    await expect(
      resolver().collectCurrentUserOralAttendance({ ...input(), collectedByUserId: 'another-user' }, context as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(eventAttendance.upsert).not.toHaveBeenCalled();
  });

  it('accepts an empty batch without authorization and rejects oversized or mixed-event batches', async () => {
    const subject = resolver();
    await expect(subject.collectCurrentUserOralAttendances([], context as never)).resolves.toEqual([]);
    expect(currentUserContext.requireCurrentPerson).not.toHaveBeenCalled();

    const oversized = Array.from({ length: 1001 }, (_, index) => input({ personId: `person-${index}` }));
    await expect(subject.collectCurrentUserOralAttendances(oversized, context as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      subject.collectCurrentUserOralAttendances(
        [input(), input({ eventId: 'event-2', personId: 'person-2' })],
        context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('writes a validated same-event batch in input order and invalidates once', async () => {
    const first = { ...input(), status: EventAttendanceStatus.PRESENT };
    const second = input({ personId: 'person-2', status: EventAttendanceStatus.ABSENT });
    const results = [
      { id: 'attendance-1', eventId: 'event-1', personId: 'person-1', status: EventAttendanceStatus.PRESENT },
      { id: 'attendance-2', eventId: 'event-1', personId: 'person-2', status: EventAttendanceStatus.ABSENT },
    ];
    eventAttendance.findUnique.mockResolvedValue(null);
    eventAttendance.upsert.mockResolvedValueOnce(results[0]).mockResolvedValueOnce(results[1]);

    await expect(resolver().collectCurrentUserOralAttendances([first, second], context as never)).resolves.toEqual(
      results,
    );

    expect(findAttendanceOralRosterPersonIds).toHaveBeenCalledWith(prisma, 'event-1', ['person-1', 'person-2']);
    expect(eventAttendance.upsert).toHaveBeenCalledTimes(2);
    expect(attendanceCategories.refreshForAttendance).toHaveBeenNthCalledWith(
      1,
      'person-1',
      'event-1',
      expect.anything(),
    );
    expect(attendanceCategories.refreshForAttendance).toHaveBeenNthCalledWith(
      2,
      'person-2',
      'event-1',
      expect.anything(),
    );
    expect(dashboardInsights.invalidateCachedInsights).toHaveBeenCalledTimes(1);
  });

  it('rejects a batch containing a non-roster person or forged collector without partial writes', async () => {
    jest.mocked(findAttendanceOralRosterPersonIds).mockResolvedValueOnce(new Set(['person-1']));
    await expect(
      resolver().collectCurrentUserOralAttendances([input(), input({ personId: 'person-2' })], context as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    jest.mocked(findAttendanceOralRosterPersonIds).mockResolvedValueOnce(new Set(['person-1', 'person-2']));
    await expect(
      resolver().collectCurrentUserOralAttendances(
        [input(), input({ personId: 'person-2', collectedByUserId: 'forged-user' })],
        context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  function resolver(): CurrentUserAttendanceCollectionResolver {
    return new CurrentUserAttendanceCollectionResolver(
      prisma as never,
      currentUserContext as never,
      attendanceCategories as never,
      frozenResources as never,
      authorizationPolicy as never,
      auditLog as never,
      dashboardInsights as never,
      undefined,
      sportsMutationEvents as never,
    );
  }
});

function input(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'event-1',
    personId: 'person-1',
    status: EventAttendanceStatus.PRESENT,
    collectedAt: new Date(publicFixtureDateFromNow()),
    collectedByUserId: 'collector-user',
    location: { latitude: -22.1, longitude: -51.4, accuracyMeters: 8 },
    ...overrides,
  };
}
