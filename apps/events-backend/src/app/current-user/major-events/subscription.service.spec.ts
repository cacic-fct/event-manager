import { BadRequestException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { CurrentUserMajorEventSubscriptionService } from './subscription.service';

describe('CurrentUserMajorEventSubscriptionService ranked allocation', () => {
  let service: CurrentUserMajorEventSubscriptionService;

  beforeEach(() => {
    service = new CurrentUserMajorEventSubscriptionService({} as never, {} as never);
  });

  it('allocates the highest ranked available events up to desired category counts', () => {
    const events = [
      rankedEvent('auto', 'OTHER', 0, 1, true),
      rankedEvent('course-full', 'MINICURSO', 2, 3, false, 0),
      rankedEvent('course-open', 'MINICURSO', 4, 5),
      rankedEvent('lecture-open', 'PALESTRA', 6, 7),
    ];

    expect(
      service.allocateRankedEventIds(events, {
        desiredCourses: 1,
        desiredLectures: 1,
        desiredUncategorized: 1,
      }),
    ).toEqual(['auto', 'course-open', 'lecture-open']);
  });

  it('rejects desired counts below automatic subscriptions', () => {
    expect(() =>
      service.resolveRankedDesiredCounts(
        {
          maxCoursesPerAttendee: null,
          maxLecturesPerAttendee: null,
          maxUncategorizedPerAttendee: null,
        } as never,
        [rankedEvent('auto', 'OTHER', 0, 1, true)],
        { desiredCourses: 0, desiredLectures: 0, desiredUncategorized: 0 },
      ),
    ).toThrow(BadRequestException);
  });

  it('normalizes selected events, amount paid, payment tier, and desired counts', () => {
    expect(service.normalizeSelectedEventIds([' event-1 ', '', 'event-2', 'event-1'])).toEqual(['event-1', 'event-2']);
    expect(service.normalizeAmountPaid(undefined)).toBeUndefined();
    expect(service.normalizeAmountPaid(null)).toBeNull();
    expect(service.normalizeAmountPaid(1500)).toBe(1500);
    expect(() => service.normalizeAmountPaid(-1)).toThrow(BadRequestException);

    expect(service.normalizePaymentTier(undefined)).toBeUndefined();
    expect(service.normalizePaymentTier(null)).toBeNull();
    expect(service.normalizePaymentTier('  student  ')).toBe('student');
    expect(service.normalizePaymentTier('   ')).toBeNull();

    expect(service.normalizeDesiredCount(undefined, 2)).toBe(2);
    expect(service.normalizeDesiredCount(null, 2)).toBe(2);
    expect(service.normalizeDesiredCount(1, 2)).toBe(1);
    expect(() => service.normalizeDesiredCount(1.5, 2)).toThrow(BadRequestException);
    expect(() => service.normalizeDesiredCount(-1, 2)).toThrow(BadRequestException);
  });

  it('rejects desired counts above ranked event capacity', () => {
    const majorEvent = {
      maxCoursesPerAttendee: 1,
      maxLecturesPerAttendee: null,
      maxUncategorizedPerAttendee: null,
    } as never;
    const events = [rankedEvent('course-1', 'MINICURSO', 8, 9), rankedEvent('lecture-1', 'PALESTRA', 10, 11)];

    expect(() =>
      service.resolveRankedDesiredCounts(majorEvent, events, {
        desiredCourses: 2,
        desiredLectures: 1,
        desiredUncategorized: 0,
      }),
    ).toThrow('Desired course count exceeds available course choices (1).');
  });

  it('skips unavailable and conflicting ranked preference items', () => {
    const events = [
      rankedEvent('first-course', 'MINICURSO', 8, 10),
      rankedEvent('conflicting-course', 'MINICURSO', 9, 11),
      rankedEvent('group-a', 'PALESTRA', 11, 12, false, 1, 'group-1'),
      rankedEvent('group-b', 'PALESTRA', 12, 13, false, 0, 'group-1'),
      rankedEvent('open-lecture', 'PALESTRA', 13, 14),
    ];

    expect(
      service.allocateRankedEventIds(events, {
        desiredCourses: 2,
        desiredLectures: 1,
        desiredUncategorized: 0,
      }),
    ).toEqual(['first-course', 'open-lecture']);
  });

  it('resolves the next subscription status from payment rules', () => {
    expect(service.resolveNextSubscriptionStatus(false)).toBe(SubscriptionStatus.CONFIRMED);
    expect(service.resolveNextSubscriptionStatus(true)).toBe(SubscriptionStatus.WAITING_RECEIPT_UPLOAD);
    expect(service.resolveNextSubscriptionStatus(true, SubscriptionStatus.CANCELED)).toBe(
      SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
    );
    expect(service.resolveNextSubscriptionStatus(true, SubscriptionStatus.REJECTED_NO_SLOTS)).toBe(
      SubscriptionStatus.RECEIPT_UNDER_REVIEW,
    );
    expect(service.resolveNextSubscriptionStatus(true, SubscriptionStatus.REJECTED_SCHEDULE_CONFLICT)).toBe(
      SubscriptionStatus.RECEIPT_UNDER_REVIEW,
    );
    expect(service.resolveNextSubscriptionStatus(true, SubscriptionStatus.CONFIRMED)).toBeUndefined();
  });

  it('validates subscription windows, selection limits, schedule conflicts, and full event groups', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T12:00:00.000Z'));

    expect(() =>
      service.ensureMajorEventSubscriptionWindowOpen({
        id: 'major-1',
        subscriptionStartDate: new Date('2026-06-02T00:00:00.000Z'),
        subscriptionEndDate: null,
      } as never),
    ).toThrow(BadRequestException);
    expect(() =>
      service.ensureMajorEventSubscriptionWindowOpen({
        id: 'major-1',
        subscriptionStartDate: null,
        subscriptionEndDate: new Date('2026-05-31T00:00:00.000Z'),
      } as never),
    ).toThrow(BadRequestException);
    expect(() =>
      service.ensureMajorEventSubscriptionWindowOpen({
        id: 'major-1',
        subscriptionStartDate: new Date('2026-05-31T00:00:00.000Z'),
        subscriptionEndDate: new Date('2026-06-02T00:00:00.000Z'),
      } as never),
    ).not.toThrow();

    expect(() =>
      service.ensureMajorEventEventLimits(
        { maxCoursesPerAttendee: 1, maxLecturesPerAttendee: 1 } as never,
        [
          rankedEvent('course-1', 'MINICURSO', 8, 9),
          rankedEvent('course-2', 'MINICURSO', 9, 10),
        ] as never,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      service.ensureMajorEventEventLimits(
        { maxCoursesPerAttendee: 2, maxLecturesPerAttendee: 1 } as never,
        [
          rankedEvent('lecture-1', 'PALESTRA', 8, 9),
          rankedEvent('lecture-2', 'PALESTRA', 9, 10),
        ] as never,
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      service.ensureMajorEventScheduleHasNoConflicts([
        rankedEvent('event-1', 'OTHER', 8, 10),
        rankedEvent('event-2', 'OTHER', 9, 11),
      ] as never),
    ).toThrow(BadRequestException);
    expect(() =>
      service.ensureMajorEventScheduleHasNoConflicts([
        rankedEvent('event-1', 'OTHER', 8, 10, false, 1, 'group-1'),
        rankedEvent('event-2', 'OTHER', 9, 11, false, 1, 'group-1'),
      ] as never),
    ).not.toThrow();

    expect(() =>
      service.ensureEventGroupsAreFullySelected(new Set(['event-1']), [
        { id: 'event-1', eventGroupId: 'group-1' },
        { id: 'event-2', eventGroupId: 'group-1' },
      ]),
    ).toThrow(BadRequestException);
    expect(() =>
      service.ensureEventGroupsAreFullySelected(new Set(['event-1', 'event-2']), [
        { id: 'event-1', eventGroupId: 'group-1' },
        { id: 'event-2', eventGroupId: 'group-1' },
      ]),
    ).not.toThrow();

    jest.useRealTimers();
  });

  it('groups selected and confirmed events by major event', async () => {
    const prisma = {
      majorEventSubscriptionEventSelection: {
        findMany: jest.fn().mockResolvedValue([
          { subscription: { majorEventId: 'major-1' }, event: publicEvent('event-1', 'major-1') },
          { subscription: { majorEventId: 'major-1' }, event: publicEvent('event-2', 'major-1') },
          { subscription: { majorEventId: 'major-2' }, event: publicEvent('event-3', 'major-2') },
        ]),
      },
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([
          { event: publicEvent('event-4', 'major-1') },
          { event: publicEvent('event-without-major', null) },
        ]),
      },
    };
    service = new CurrentUserMajorEventSubscriptionService(prisma as never, {} as never);

    await expect(service.getSelectedEventsByMajorEvent('person-1', [])).resolves.toEqual(new Map());
    const selected = await service.getSelectedEventsByMajorEvent('person-1', ['major-1', 'major-2']);
    expect(selected.get('major-1')?.map((event) => event.id)).toEqual(['event-1', 'event-2']);
    expect(selected.get('major-2')?.map((event) => event.id)).toEqual(['event-3']);

    await expect(service.getConfirmedEventsByMajorEvent('person-1', [])).resolves.toEqual(new Map());
    const confirmed = await service.getConfirmedEventsByMajorEvent('person-1', ['major-1']);
    expect(confirmed.get('major-1')?.map((event) => event.id)).toEqual(['event-4']);
    expect(confirmed.has('event-without-major')).toBe(false);
  });

  it('splits major event events into selected and not subscribed lists', async () => {
    const prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([
          { ...publicEvent('selected-event', 'major-1'), majorEventSelections: [{ eventId: 'selected-event' }] },
          { ...publicEvent('available-event', 'major-1'), majorEventSelections: [] },
        ]),
      },
    };
    service = new CurrentUserMajorEventSubscriptionService(prisma as never, {} as never);

    await expect(service.getMajorEventSubscriptionEvents('person-1', 'major-1')).resolves.toEqual({
      selectedEvents: [publicEvent('selected-event', 'major-1')],
      notSubscribedEvents: [publicEvent('available-event', 'major-1')],
    });
  });
});

function rankedEvent(
  id: string,
  type: string,
  startHour: number,
  endHour: number,
  autoSubscribe = false,
  slotsAvailable: number | null = 1,
  eventGroupId: string | null = null,
) {
  return {
    id,
    type,
    eventGroupId,
    startDate: new Date(`2026-06-01T${String(startHour).padStart(2, '0')}:00:00.000Z`),
    endDate: new Date(`2026-06-01T${String(endHour).padStart(2, '0')}:00:00.000Z`),
    slots: slotsAvailable == null ? null : 1,
    slotsAvailable,
    autoSubscribe,
  };
}

function publicEvent(id: string, majorEventId: string | null) {
  return {
    id,
    name: id,
    majorEventId,
    startDate: new Date('2026-06-01T12:00:00.000Z'),
  };
}
