import { Permission } from '@cacic-fct/shared-permissions';
import { AttendanceReviewFlagStatus } from '@prisma/client';
import { REQUIRED_PERMISSIONS_KEY } from '../../auth/auth.constants';
import { AttendanceAnalyticsResolver } from './attendance-analytics.resolver';

describe('AttendanceAnalyticsResolver', () => {
  const analytics = {
    snapshot: jest.fn(),
    pendingReviewSummaries: jest.fn(),
    reviewFlag: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('guards snapshots with read access and review operations with update access', () => {
    expect(permissionFor('eventAttendanceAnalytics')).toEqual([Permission.EventAttendance.Read]);
    expect(permissionFor('attendanceReviewEventSummaries')).toEqual([Permission.EventAttendance.Update]);
    expect(permissionFor('reviewAttendanceFlag')).toEqual([Permission.EventAttendance.Update]);
  });

  it('forwards snapshot windows and pending review summaries', async () => {
    const snapshot = { eventId: 'event-1', generatedAt: new Date() };
    const summaries = [{ eventId: 'event-1', pendingCount: 2 }];
    analytics.snapshot.mockResolvedValueOnce(snapshot);
    analytics.pendingReviewSummaries.mockResolvedValueOnce(summaries);
    const subject = resolver();

    await expect(subject.eventAttendanceAnalytics('event-1', 30)).resolves.toBe(snapshot);
    await expect(subject.attendanceReviewEventSummaries()).resolves.toBe(summaries);
    expect(analytics.snapshot).toHaveBeenCalledWith('event-1', {
      windowMinutes: 30,
      start: undefined,
      end: undefined,
    });
  });

  it('forwards a fixed time interval without changing global review access', async () => {
    const start = new Date('2026-08-16T12:00:00.000Z');
    const end = new Date('2026-08-16T13:00:00.000Z');
    analytics.snapshot.mockResolvedValueOnce({ eventId: 'event-1' });

    await resolver().eventAttendanceAnalytics('event-1', undefined, start, end);

    expect(analytics.snapshot).toHaveBeenCalledWith('event-1', {
      windowMinutes: undefined,
      start,
      end,
    });
  });

  it.each([AttendanceReviewFlagStatus.RESOLVED, AttendanceReviewFlagStatus.DISMISSED])(
    'accepts review status %s and attributes the request actor',
    async (status) => {
      const expected = { id: 'flag-1', status };
      analytics.reviewFlag.mockResolvedValueOnce(expected);

      await expect(
        resolver().reviewAttendanceFlag('flag-1', status, 'Revisado', {
          request: { user: { sub: 'reviewer-1' } },
        }),
      ).resolves.toBe(expected);
      expect(analytics.reviewFlag).toHaveBeenCalledWith('flag-1', status, 'reviewer-1', 'Revisado');
    },
  );

  it('rejects unknown review statuses before calling the analytics service', async () => {
    await expect(
      Promise.resolve().then(() =>
        resolver().reviewAttendanceFlag('flag-1', 'PENDING', undefined, {
          req: { user: { sub: 'reviewer-1' } },
        }),
      ),
    ).rejects.toThrow('Invalid attendance review status.');
    expect(analytics.reviewFlag).not.toHaveBeenCalled();
  });

  function resolver(): AttendanceAnalyticsResolver {
    return new AttendanceAnalyticsResolver(analytics as never);
  }
});

function permissionFor(operation: keyof AttendanceAnalyticsResolver): unknown {
  return Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, AttendanceAnalyticsResolver.prototype[operation]);
}
