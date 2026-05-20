import { BadRequestException } from '@nestjs/common';
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
});

function rankedEvent(
  id: string,
  type: string,
  startHour: number,
  endHour: number,
  autoSubscribe = false,
  slotsAvailable: number | null = 1,
) {
  return {
    id,
    type,
    eventGroupId: null,
    startDate: new Date(`2026-06-01T${String(startHour).padStart(2, '0')}:00:00.000Z`),
    endDate: new Date(`2026-06-01T${String(endHour).padStart(2, '0')}:00:00.000Z`),
    slots: slotsAvailable == null ? null : 1,
    slotsAvailable,
    autoSubscribe,
  };
}
