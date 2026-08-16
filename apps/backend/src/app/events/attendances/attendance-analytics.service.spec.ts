import { AttendanceCreationMethod } from '@prisma/client';
import { findInconsistentLocationPatterns, haversineMeters } from './attendance-analytics.service';

describe('attendance analytics location fairness', () => {
  const eventLatitude = -22.121;
  const eventLongitude = -51.408;

  it('does not flag isolated distant points or a stable distant sequence', () => {
    const attendances = Array.from({ length: 8 }, (_, index) =>
      attendance({
        minute: index,
        latitude: -22.021,
        longitude: -51.408,
        accuracyMeters: 4,
      }),
    );

    expect(findInconsistentLocationPatterns(attendances, eventLatitude, eventLongitude)).toEqual([]);
  });

  it('does not flag a single apparent teleport even when reported accuracy is optimistic', () => {
    const attendances = [
      attendance({ minute: 0, latitude: eventLatitude, longitude: eventLongitude }),
      attendance({ minute: 1, latitude: -22.021, longitude: eventLongitude, accuracyMeters: 3 }),
      ...Array.from({ length: 5 }, (_, index) =>
        attendance({ minute: index + 2, latitude: -22.021, longitude: eventLongitude, accuracyMeters: 3 }),
      ),
    ];

    expect(findInconsistentLocationPatterns(attendances, eventLatitude, eventLongitude)).toEqual([]);
  });

  it('flags only repeated near-to-far transitions across a sufficiently large scan session', () => {
    const attendances = Array.from({ length: 8 }, (_, index) =>
      attendance({
        minute: index,
        latitude: index % 2 === 0 ? eventLatitude : -22.021,
        longitude: eventLongitude,
        accuracyMeters: 5,
      }),
    );

    expect(findInconsistentLocationPatterns(attendances, eventLatitude, eventLongitude)).toEqual([
      { actorId: 'collector-1', transitionCount: 7, scanCount: 8 },
    ]);
  });

  it('keeps the distance calculation within a realistic tolerance', () => {
    expect(haversineMeters(eventLatitude, eventLongitude, eventLatitude, eventLongitude)).toBe(0);
    expect(haversineMeters(eventLatitude, eventLongitude, -22.021, eventLongitude)).toBeGreaterThan(10_000);
  });
});

function attendance(input: {
  minute: number;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}) {
  const attendedAt = new Date(Date.UTC(2026, 7, 16, 18, input.minute));
  return {
    personId: `person-${input.minute}`,
    attendedAt,
    createdAt: attendedAt,
    createdById: 'collector-1',
    committedById: 'collector-1',
    createdByMethod: AttendanceCreationMethod.SCANNER,
    status: 'PRESENT' as const,
    collectedLatitude: input.latitude,
    collectedLongitude: input.longitude,
    collectedAccuracyMeters: input.accuracyMeters ?? 5,
  };
}
