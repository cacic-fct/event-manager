import {
  CertificateIssuedTo,
  CertificateScope,
} from '@cacic-eventos/shared-data-types';
import { SubscriptionStatus } from '@prisma/client';
import { CertificateEligibilityService } from './certificate-eligibility.service';

describe('CertificateEligibilityService', () => {
  const majorEventId = 'major-event-1';
  const person = {
    id: 'person-1',
    name: 'Ada Lovelace',
    email: null,
    secondaryEmails: [],
    phone: null,
    identityDocument: null,
    academicId: null,
    userId: null,
    mergedIntoId: null,
    externalRef: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedById: null,
  };
  const event = {
    id: 'event-1',
    name: 'Opening Talk',
    creditMinutes: 60,
    startDate: new Date('2026-01-02T10:00:00.000Z'),
    endDate: new Date('2026-01-02T11:00:00.000Z'),
    type: 'PALESTRA',
    emoji: 'mic',
    description: null,
    shortDescription: null,
    latitude: null,
    longitude: null,
    locationDescription: null,
    majorEventId,
    majorEvent: null,
    eventGroupId: null,
    eventGroup: null,
    allowSubscription: false,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    slots: null,
    autoSubscribe: false,
    shouldIssueCertificate: true,
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: false,
    onlineAttendanceCode: null,
    onlineAttendanceStartDate: null,
    onlineAttendanceEndDate: null,
    publiclyVisible: true,
    youtubeCode: null,
    buttonText: null,
    buttonLink: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedById: null,
  };
  const config = {
    id: 'config-1',
    scope: CertificateScope.MAJOR_EVENT,
    issuedTo: CertificateIssuedTo.ATTENDEE,
    majorEventId,
  };

  it('skips confirmed major-event subscribers with no event attendance', async () => {
    const service = new CertificateEligibilityService({
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: majorEventId }),
      },
      majorEventSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            majorEventId,
            personId: person.id,
            subscriptionStatus: SubscriptionStatus.CONFIRMED,
            person,
          },
        ]),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([event]),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as never);

    await expect(
      service.resolveEligibleRecipients(config as never),
    ).resolves.toEqual([]);
  });

  it('keeps major-event subscribers who attended at least one event', async () => {
    const service = new CertificateEligibilityService({
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: majorEventId }),
      },
      majorEventSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            majorEventId,
            personId: person.id,
            subscriptionStatus: SubscriptionStatus.CONFIRMED,
            person,
          },
        ]),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([event]),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            personId: person.id,
            event,
          },
        ]),
      },
    } as never);

    await expect(
      service.resolveEligibleRecipients(config as never),
    ).resolves.toEqual([
      {
        person,
        events: [event],
      },
    ]);
  });

  it('resolves lecturer configs from event lecturers', async () => {
    const eventLecturerFindMany = jest.fn().mockResolvedValue([
      {
        personId: person.id,
        eventId: event.id,
        person,
      },
    ]);
    const service = new CertificateEligibilityService({
      eventLecturer: {
        findMany: eventLecturerFindMany,
      },
    } as never);

    await expect(
      service.resolveEligibleRecipients({
        id: 'config-1',
        scope: CertificateScope.EVENT,
        issuedTo: CertificateIssuedTo.LECTURER,
        eventId: event.id,
        event,
      } as never),
    ).resolves.toEqual([
      {
        person,
        events: [event],
      },
    ]);
    expect(eventLecturerFindMany).toHaveBeenCalledWith({
      where: {
        eventId: {
          in: [event.id],
        },
        person: {
          deletedAt: null,
        },
      },
      select: {
        personId: true,
        eventId: true,
        person: {
          select: expect.any(Object),
        },
      },
    });
  });
});
