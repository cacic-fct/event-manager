import { fakerPT_BR as faker } from '@faker-js/faker';
import type { EventAttendanceAnalyticsSnapshot } from '@cacic-fct/event-manager-admin-contracts';
import { adminFixtureDateFromNow } from '../../testing/admin-entity-fixtures';

export interface AttendanceStatisticsFixtureOptions {
  collectorCount: number;
  eventName: string;
  historyMinutes: number;
  noShowCount: number;
  pendingOfflineCount: number;
  presentCount: number;
  reviewCount: number;
}

const eventId = 'event-command-center-demo';

export function createAttendanceStatisticsSnapshot(
  options: AttendanceStatisticsFixtureOptions,
): EventAttendanceAnalyticsSnapshot {
  faker.seed(20260816 + options.collectorCount * 7 + options.reviewCount * 11 + options.presentCount);
  const generatedAt = new Date(adminFixtureDateFromNow(0, 18));
  const atMinuteOffset = (offset: number) => new Date(generatedAt.getTime() + offset * 60_000).toISOString();
  const collectors = Array.from({ length: options.collectorCount }, (_, index) => {
    const count = Math.max(1, Math.round(options.presentCount / Math.max(1, options.collectorCount)) + index * 3);
    const offlineCount = Math.min(count, index % 3 === 0 ? faker.number.int({ min: 0, max: 14 }) : 0);
    return {
      actorId: `collector-${index + 1}`,
      name: faker.person.fullName(),
      count,
      firstScanAt: atMinuteOffset(-options.historyMinutes + index * 2),
      lastScanAt: atMinuteOffset(-index - 1),
      onlineCount: count - offlineCount,
      offlineCount,
      methods: [{ method: index % 3 === 2 ? 'MANUAL_INPUT' : 'SCANNER', count }],
    };
  });
  const reviewKinds = ['UNUSUAL_VOLUME', 'OFFLINE_BACKLOG', 'DISTANT_LOCATION', 'ATTENDANCE_REMOVAL'];
  const reviewTitles = [
    'Volume de coleta incomum',
    'Fila off-line acumulada',
    'Padrão de localização inconsistente',
    'Remoção de presença requer revisão',
  ];

  return {
    eventId,
    eventName: options.eventName,
    emoji: '🎓',
    generatedAt: generatedAt.toISOString(),
    windowMinutes: null,
    windowStart: null,
    windowEnd: null,
    presentCount: options.presentCount,
    noShowCount: options.noShowCount,
    pendingReviewCount: options.reviewCount,
    pendingOfflineCount: options.pendingOfflineCount,
    eventLatitude: -22.1208,
    eventLongitude: -51.4079,
    scansPerMinute: Array.from({ length: Math.min(24, options.historyMinutes) }, (_, index) => ({
      start: atMinuteOffset(
        Math.round((index - Math.min(24, options.historyMinutes) + 1) * Math.max(1, options.historyMinutes / 24)),
      ),
      count: options.presentCount === 0 ? 0 : faker.number.int({ min: 1, max: Math.max(2, options.collectorCount * 5) }),
    })).filter((bucket) => bucket.count > 0),
    scansByHour: options.presentCount === 0 ? [] : Array.from({ length: Math.min(24, Math.max(1, Math.ceil(options.historyMinutes / 60))) }, (_, index) => ({
      start: atMinuteOffset((index + 1) * -60),
      count: faker.number.int({ min: 10, max: Math.max(10, options.presentCount) }),
    })),
    collectors,
    methods: options.presentCount === 0 ? [] : [
      { method: 'SCANNER', count: Math.max(0, options.presentCount - options.pendingOfflineCount) },
      { method: 'MANUAL_INPUT', count: Math.min(options.presentCount, options.pendingOfflineCount) },
    ],
    heatmapPoints: options.presentCount === 0 ? [] : Array.from({ length: Math.min(5, Math.max(1, options.collectorCount)) }, (_, index) => ({
      latitude: -22.1208 + index * 0.0002,
      longitude: -51.4079 - index * 0.0002,
      count: faker.number.int({ min: 5, max: Math.max(5, options.presentCount) }),
      averageAccuracyMeters: faker.number.int({ min: 8, max: 45 }),
    })),
    reviewItems: Array.from({ length: options.reviewCount }, (_, index) => ({
      id: `review-${index + 1}`,
      eventId,
      kind: reviewKinds[index % reviewKinds.length] ?? 'UNUSUAL_VOLUME',
      severity: index % 4 === 1 ? 'CRITICAL' as const : index % 4 === 2 ? 'INFO' as const : 'WARNING' as const,
      status: 'PENDING' as const,
      title: reviewTitles[index % reviewTitles.length] ?? 'Sinal operacional',
      summary: `${faker.person.fullName()} registrou um padrão que merece confirmação da equipe organizadora.`,
      detectedAt: atMinuteOffset(-5 - index * 4),
      actorId: collectors[index % Math.max(1, collectors.length)]?.actorId ?? null,
      actorName: collectors[index % Math.max(1, collectors.length)]?.name ?? null,
      deepLink: index === 3 ? `/attendances/${eventId}/review/review-${index + 1}` : null,
    })),
  };
}
