import type { SubscriptionsFeed } from '@cacic-fct/shared-utils';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { createPublicStoryEvent, createPublicStoryMajorEvent, publicStoryDate } from '../../../testing/public-event-story-fixtures';

export type AttendancesStoryState = 'ready' | 'offline' | 'loading' | 'error';

export interface AttendancesStoryControls {
  state: AttendancesStoryState;
  majorEventCount: number;
  eventCount: number;
  certificateFolderCount: number;
  attendanceEvery: number;
  lecturerEvery: number;
  sportsManagerEvery: number;
  issuedCertificateEvery: number;
  longNames: boolean;
  certificateArchiveCooldownSeconds: number;
}

export const attendancesStoryDefaultControls: AttendancesStoryControls = {
  state: 'ready',
  majorEventCount: 5,
  eventCount: 12,
  certificateFolderCount: 3,
  attendanceEvery: 2,
  lecturerEvery: 5,
  sportsManagerEvery: 7,
  issuedCertificateEvery: 3,
  longNames: false,
  certificateArchiveCooldownSeconds: 0,
};

export const attendancesStoryControlArgTypes = {
  state: { control: 'select', options: ['ready', 'offline', 'loading', 'error'] },
  majorEventCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
  eventCount: { control: { type: 'range', min: 0, max: 40, step: 1 } },
  certificateFolderCount: { control: { type: 'range', min: 0, max: 12, step: 1 } },
  attendanceEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
  lecturerEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
  sportsManagerEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
  issuedCertificateEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
  longNames: { control: 'boolean' },
  certificateArchiveCooldownSeconds: { control: { type: 'range', min: 0, max: 900, step: 60 } },
} as const;

export function createAttendancesStoryFeed(controls: AttendancesStoryControls): SubscriptionsFeed {
  faker.seed(20_260_824);
  const majorEventCount = clamp(controls.majorEventCount, 20);
  const eventCount = clamp(controls.eventCount, 40);
  const majorEventItems = Array.from({ length: majorEventCount }, (_, index) => {
    const majorEvent = createPublicStoryMajorEvent({
      id: `attendance-major-${index + 1}`,
      name: controls.longNames
        ? `Grande evento interdisciplinar de tecnologia, ciência, cultura e extensão ${index + 1}`
        : `${['Semana da Computação', 'Jornada de Dados', 'Mostra de Extensão'][index % 3]} · ${faker.word.adjective()}`,
      emoji: ['💻', '📊', '🌎'][index % 3],
      startDate: publicStoryDate(-30 - index * 3, 9),
      endDate: publicStoryDate(-28 - index * 3, 20),
    });
    return {
      id: `attendance-major-item-${index + 1}`,
      majorEventId: majorEvent.id,
      majorEvent,
      subscriptionStatus: ['WAITING_RECEIPT_UPLOAD', 'REJECTED_SCHEDULE_CONFLICT', 'RECEIPT_UNDER_REVIEW', 'CONFIRMED'][
        index % 4
      ],
      amountPaid: index % 4 === 0 ? null : 2_500,
      participation: participation(controls, index),
    };
  });

  const events = Array.from({ length: eventCount }, (_, index) =>
    createPublicStoryEvent({
      id: `attendance-event-${index + 1}`,
      index,
      name: controls.longNames
        ? `Atividade complementar interdisciplinar de tecnologia e acessibilidade ${index + 1}`
        : `${['Oficina de Angular', 'Acessibilidade digital', 'Robótica comunitária'][index % 3]} · ${faker.word.adjective()}`,
      context: index % 3 === 0 ? 'event-group' : 'short-description',
      dayOffset: -2 - index,
      startHour: 9 + (index % 8),
      durationHours: 1 + (index % 3),
    }),
  );
  const eventItems = events.map((event, index) => ({
    __typename: 'SubscribedSingleEventItem' as const,
    id: event.id,
    type: 'single' as const,
    startDate: event.startDate,
    event,
    participation: participation(controls, index + majorEventCount),
  }));
  const attendances = events
    .filter((_event, index) => matchesEvery(index, controls.attendanceEvery))
    .map((event) => ({
      eventId: event.id,
      attendedAt: event.endDate,
      createdAt: event.endDate,
      event: { id: event.id, majorEventId: event.majorEventId ?? null, eventGroupId: event.eventGroupId ?? null },
    }));
  const standaloneCertificateFolders = Array.from(
    { length: clamp(controls.certificateFolderCount, 12) },
    (_, index) => ({
      id: `certificate-folder-${index + 1}`,
      name: controls.longNames
        ? `Atividades complementares de formação acadêmica e comunitária ${index + 1}`
        : `Atividades complementares ${index + 1}`,
      emoji: ['🏅', '🎓', '📜'][index % 3],
      certificates: [
        {
          id: `standalone-certificate-${index + 1}`,
          configId: `standalone-config-${index + 1}`,
          issuedAt: publicStoryDate(-index - 1, 10),
          config: {
            id: `standalone-config-${index + 1}`,
            name: `Certificado avulso ${index + 1}`,
            scope: 'OTHER' as const,
            certificateText: faker.lorem.sentence(),
            certificateTemplate: { id: 'template-story', name: 'Modelo CACiC' },
          },
          certificateTemplate: { id: 'template-story', name: 'Modelo CACiC' },
        },
      ],
    }),
  );

  return { majorEventItems, eventItems, attendances, standaloneCertificateFolders };
}

function participation(controls: AttendancesStoryControls, index: number) {
  return {
    isSubscribed: index % 4 !== 1,
    isLecturer: matchesEvery(index, controls.lecturerEvery),
    hasIssuedCertificate: matchesEvery(index, controls.issuedCertificateEvery),
    isSportsManager: matchesEvery(index, controls.sportsManagerEvery),
  };
}

function matchesEvery(index: number, every: number): boolean {
  return every > 0 && (index + 1) % every === 0;
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), 0), max);
}
