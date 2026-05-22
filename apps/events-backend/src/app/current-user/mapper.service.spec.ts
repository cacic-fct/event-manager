import { UserRole } from '@cacic-fct/shared-data-types';
import { CurrentUserEventMapperService } from './mapper.service';

describe('CurrentUserEventMapperService', () => {
  const service = new CurrentUserEventMapperService();

  it('maps users and normalizes legacy CACIC roles', () => {
    const createdAt = new Date('2026-05-21T12:00:00.000Z');
    const updatedAt = new Date('2026-05-21T13:00:00.000Z');

    expect(
      service.mapUser({
        id: 'user-1',
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        identityDocument: null,
        academicId: '123',
        role: 'CACIC',
        createdAt,
        createdById: null,
        updatedAt,
        updatedById: 'user-0',
      } as never),
    ).toEqual({
      id: 'user-1',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      identityDocument: undefined,
      academicId: '123',
      role: UserRole.CACIC,
      createdAt,
      createdById: undefined,
      updatedAt,
      updatedById: 'user-0',
    });
  });

  it('maps people with nested user records and nullables converted to undefined', () => {
    const createdAt = new Date('2026-05-21T12:00:00.000Z');
    const updatedAt = new Date('2026-05-21T13:00:00.000Z');

    expect(
      service.mapPerson({
        id: 'person-1',
        name: 'Ada Lovelace',
        email: null,
        secondaryEmails: ['ada@history.example'],
        phone: null,
        identityDocument: null,
        academicId: null,
        userId: 'user-1',
        user: {
          id: 'user-1',
          email: 'ada@example.com',
          name: 'Ada',
          identityDocument: null,
          academicId: null,
          role: 'USER',
          createdAt,
          createdById: null,
          updatedAt,
          updatedById: null,
        },
        mergedIntoId: null,
        externalRef: null,
        deletedAt: null,
        createdAt,
        createdById: null,
        updatedAt,
        updatedById: null,
      } as never),
    ).toEqual(
      expect.objectContaining({
        id: 'person-1',
        email: undefined,
        secondaryEmails: ['ada@history.example'],
        userId: 'user-1',
        user: expect.objectContaining({ id: 'user-1', role: 'USER' }),
        mergedIntoId: undefined,
        deletedAt: undefined,
      }),
    );
  });

  it('maps public event groups and events with nested major event data', () => {
    const event = eventFixture();

    expect(service.mapPublicEvent(event as never)).toEqual(
      expect.objectContaining({
        id: 'event-1',
        name: 'Opening Talk',
        creditMinutes: undefined,
        description: undefined,
        majorEventId: 'major-event-1',
        majorEvent: expect.objectContaining({
          id: 'major-event-1',
          shouldIssueCertificate: true,
        }),
        eventGroupId: 'group-1',
        eventGroup: {
          id: 'group-1',
          name: 'Minicursos',
          emoji: '🧪',
          shouldIssueCertificateForEachEvent: false,
          shouldIssuePartialCertificate: true,
          shouldIssueCertificate: true,
        },
      }),
    );
  });

  it('builds subscription feed items and default participation', () => {
    const event = service.mapPublicEvent(eventFixture() as never);
    const createdAt = new Date('2026-05-20T12:00:00.000Z');

    expect(
      service.mapCurrentUserSubscriptionFeedSingleEventItem({
        id: 'subscription-1',
        eventId: event.id,
        event,
        createdAt,
      } as never),
    ).toEqual({
      type: 'SINGLE_EVENT',
      subscriptionId: 'subscription-1',
      eventId: 'event-1',
      event,
      date: event.startDate,
      createdAt,
      participation: {
        isSubscribed: true,
        isLecturer: false,
        hasIssuedCertificate: false,
      },
    });

    expect(
      service.mapCurrentUserEventFeedItem(event, {
        isSubscribed: false,
        isLecturer: true,
        hasIssuedCertificate: true,
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'SINGLE_EVENT',
        eventId: 'event-1',
        date: event.startDate,
        createdAt: event.startDate,
        participation: {
          isSubscribed: false,
          isLecturer: true,
          hasIssuedCertificate: true,
        },
      }),
    );
  });

  it('finds earliest event dates and compares feed dates descending', () => {
    const older = { ...service.mapPublicEvent(eventFixture({ id: 'older' }) as never), startDate: new Date('2026-05-20') };
    const newer = { ...service.mapPublicEvent(eventFixture({ id: 'newer' }) as never), startDate: new Date('2026-05-22') };

    expect(service.getEarliestEventStartDate([newer, older])).toBe(older.startDate);
    expect(
      service.compareFeedDatesDescending(
        new Date('2026-05-20T12:00:00.000Z'),
        new Date('2026-05-20T13:00:00.000Z'),
        new Date('2026-05-21T12:00:00.000Z'),
        new Date('2026-05-20T12:00:00.000Z'),
      ),
    ).toBeGreaterThan(0);
    expect(
      service.compareFeedDatesDescending(
        new Date('2026-05-20T12:00:00.000Z'),
        new Date('2026-05-20T12:00:00.000Z'),
        new Date('2026-05-20T12:00:00.000Z'),
        new Date('2026-05-20T13:00:00.000Z'),
      ),
    ).toBeGreaterThan(0);
  });
});

function eventFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    name: 'Opening Talk',
    creditMinutes: null,
    startDate: new Date('2026-05-21T12:00:00.000Z'),
    endDate: new Date('2026-05-21T13:00:00.000Z'),
    emoji: '🎤',
    type: 'PALESTRA',
    description: null,
    shortDescription: null,
    latitude: null,
    longitude: null,
    locationDescription: null,
    majorEventId: 'major-event-1',
    majorEvent: {
      id: 'major-event-1',
      name: 'Semana',
      emoji: '💻',
      startDate: new Date('2026-05-21T12:00:00.000Z'),
      endDate: new Date('2026-05-23T12:00:00.000Z'),
      description: null,
      subscriptionStartDate: null,
      subscriptionEndDate: null,
      maxCoursesPerAttendee: null,
      maxLecturesPerAttendee: null,
      maxUncategorizedPerAttendee: null,
      rankedSubscriptionEnabled: false,
      buttonText: null,
      buttonLink: null,
      contactInfo: null,
      contactType: null,
      isPaymentRequired: false,
      additionalPaymentInfo: null,
      certificateConfigs: [{ id: 'config-1' }],
      majorEventPrices: [],
    },
    eventGroupId: 'group-1',
    eventGroup: {
      id: 'group-1',
      name: 'Minicursos',
      emoji: '🧪',
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: true,
      shouldIssueCertificate: true,
    },
    allowSubscription: true,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    slots: null,
    slotsAvailable: null,
    queueCount: 0,
    autoSubscribe: false,
    shouldIssueCertificate: true,
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: false,
    onlineAttendanceStartDate: null,
    onlineAttendanceEndDate: null,
    publiclyVisible: true,
    youtubeCode: null,
    buttonText: null,
    buttonLink: null,
    ...overrides,
  };
}
