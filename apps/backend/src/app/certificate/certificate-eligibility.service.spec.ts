import { CertificateIssuedTo, CertificateScope, EventType } from '@cacic-fct/shared-data-types';
import { AttendanceCategory, SubscriptionStatus } from '@prisma/client';
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
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: false,
    onlineAttendanceCode: null,
    onlineAttendanceStartDate: null,
    onlineAttendanceEndDate: null,
    isPubliclyListed: true,
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

  it('does not treat an ineligible price tier as a payment or subscription certificate exception', async () => {
    const service = new CertificateEligibilityService({
      event: { findFirst: jest.fn().mockResolvedValue({
        ...event,
        shouldIssueCertificateForNonPayingAttendees: true,
        shouldIssueCertificateForNonSubscribedAttendees: true,
      }) },
      eventAttendance: { findMany: jest.fn().mockResolvedValue([{
        personId: person.id, person, category: AttendanceCategory.NON_REGULAR,
        currentAssessment: 'PRICE_TIER_NOT_ELIGIBLE',
      }]) },
    } as never, {} as never);
    await expect(service.resolveEligibleRecipients({
      ...config, scope: CertificateScope.EVENT, eventId: event.id,
    } as never)).resolves.toEqual([]);
  });

  describe('participant payment tier restrictions', () => {
    it.each([[[]], [['Aluno']], [['Aluno', 'Professor']]])('filters only when tiers are selected: %j', async (paymentTiers) => {
      const findMany = jest.fn().mockResolvedValue([{ personId: person.id }]);
      const service = new CertificateEligibilityService({
        majorEventSubscription: { findMany },
      } as never);
      const recipients = [{ person, events: [event] }, { person: { ...person, id: 'excluded' }, events: [event] }];
      jest.spyOn(service as never, 'resolveRecipients').mockResolvedValue(recipients as never);
      const result = await service.resolveEligibleRecipients({ ...config, paymentTiers } as never);
      expect(result).toEqual(paymentTiers.length ? [recipients[0]] : recipients);
      if (paymentTiers.length) {
        expect(findMany).toHaveBeenCalledWith({
          where: { majorEventId, deletedAt: null, personId: { in: [person.id, 'excluded'] }, paymentTier: { in: paymentTiers } },
          select: { personId: true },
        });
      } else {
        expect(findMany).not.toHaveBeenCalled();
      }
    });

    it('excludes participants with no matching registration, including individual issuance', async () => {
      const service = new CertificateEligibilityService({
        majorEventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
      } as never);
      jest.spyOn(service as never, 'resolveRecipients').mockResolvedValue([{ person, events: [event] }] as never);
      await expect(service.resolveEligibleRecipients({ ...config, paymentTiers: ['Aluno'] } as never, person.id))
        .resolves.toEqual([]);
    });

    it('uses the parent major event for an event certificate', async () => {
      const findMany = jest.fn().mockResolvedValue([{ personId: person.id }]);
      const service = new CertificateEligibilityService({ majorEventSubscription: { findMany } } as never);
      jest.spyOn(service as never, 'resolveRecipients').mockResolvedValue([{ person, events: [event] }] as never);
      await service.resolveEligibleRecipients({ ...config, scope: CertificateScope.EVENT, majorEventId: null, event, paymentTiers: ['Aluno'] } as never);
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ majorEventId }) }));
    });

    it.each([CertificateIssuedTo.LECTURER, CertificateIssuedTo.OTHER, CertificateIssuedTo.SPORTS_PLAYER])(
      'does not restrict %s recipients', async (issuedTo) => {
        const findMany = jest.fn();
        const service = new CertificateEligibilityService({ majorEventSubscription: { findMany } } as never);
        const recipients = [{ person, events: [event] }];
        jest.spyOn(service as never, 'resolveRecipients').mockResolvedValue(recipients as never);
        await expect(service.resolveEligibleRecipients({ ...config, issuedTo, paymentTiers: ['Aluno'] } as never)).resolves.toEqual(recipients);
        expect(findMany).not.toHaveBeenCalled();
      },
    );
  });

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

    await expect(service.resolveEligibleRecipients(config as never)).resolves.toEqual([]);
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
            eventId: event.id,
            category: AttendanceCategory.REGULAR,
            person,
          },
        ]),
      },
    } as never);

    await expect(service.resolveEligibleRecipients(config as never)).resolves.toEqual([
      {
        person,
        events: [event],
      },
    ]);
  });

  it('resolves standalone manual recipients without target events', async () => {
    const service = new CertificateEligibilityService({
      people: {
        findFirst: jest.fn().mockResolvedValue(person),
      },
    } as never);

    await expect(
      service.resolveEligibleRecipients(
        {
          ...config,
          scope: CertificateScope.OTHER,
          issuedTo: CertificateIssuedTo.OTHER,
          majorEventId: null,
          eventGroupId: null,
          eventId: null,
        } as never,
        person.id,
      ),
    ).resolves.toEqual([
      {
        person,
        events: [],
      },
    ]);
  });

  it('keeps every completed grouped event on major-event certificates', async () => {
    const eventGroup = {
      id: 'event-group-1',
      name: 'Grouped minicourse',
      emoji: null,
      shouldIssueCertificate: true,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdById: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedById: null,
    };
    const groupedEvents = [
      {
        ...event,
        id: 'event-1',
        name: 'Grouped minicourse day 1',
        type: 'MINICURSO',
        startDate: new Date('2026-01-02T10:00:00.000Z'),
        endDate: new Date('2026-01-02T12:00:00.000Z'),
        eventGroupId: eventGroup.id,
        eventGroup,
      },
      {
        ...event,
        id: 'event-2',
        name: 'Grouped minicourse day 2',
        type: 'MINICURSO',
        startDate: new Date('2026-01-03T10:00:00.000Z'),
        endDate: new Date('2026-01-03T12:00:00.000Z'),
        eventGroupId: eventGroup.id,
        eventGroup,
      },
    ];
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
        findMany: jest.fn().mockResolvedValue(groupedEvents),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue(
          groupedEvents.map((groupedEvent) => ({
            personId: person.id,
            eventId: groupedEvent.id,
            category: AttendanceCategory.REGULAR,
            person,
          })),
        ),
      },
    } as never);

    await expect(service.resolveEligibleRecipients(config as never)).resolves.toEqual([
      {
        person,
        events: groupedEvents,
      },
    ]);
  });

  it('requires event and event-group non-subscriber policies for grouped certificates', async () => {
    const eventGroup = {
      id: 'event-group-1',
      name: 'Grouped minicourse',
      emoji: null,
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdById: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedById: null,
    };
    const groupedEvents = [
      {
        ...event,
        id: 'event-1',
        name: 'Grouped minicourse day 1',
        type: 'MINICURSO',
        startDate: new Date('2026-01-02T10:00:00.000Z'),
        endDate: new Date('2026-01-02T12:00:00.000Z'),
        eventGroupId: eventGroup.id,
        eventGroup,
        shouldIssueCertificateForNonSubscribedAttendees: false,
      },
      {
        ...event,
        id: 'event-2',
        name: 'Grouped minicourse day 2',
        type: 'MINICURSO',
        startDate: new Date('2026-01-03T10:00:00.000Z'),
        endDate: new Date('2026-01-03T12:00:00.000Z'),
        eventGroupId: eventGroup.id,
        eventGroup,
        shouldIssueCertificateForNonSubscribedAttendees: false,
      },
    ];
    const service = new CertificateEligibilityService({
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue(eventGroup),
      },
      event: {
        findMany: jest.fn().mockResolvedValue(groupedEvents),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue(
          groupedEvents.map((groupedEvent) => ({
            personId: person.id,
            eventId: groupedEvent.id,
            category: AttendanceCategory.NON_REGULAR,
            currentAssessment: 'ACTIVITY_SUBSCRIPTION_MISSING',
            person,
          })),
        ),
      },
    } as never);

    await expect(
      service.resolveEligibleRecipients({
        id: 'config-1',
        scope: CertificateScope.EVENT_GROUP,
        issuedTo: CertificateIssuedTo.ATTENDEE,
        eventGroupId: eventGroup.id,
      } as never),
    ).resolves.toEqual([]);
  });

  it('allows non-paying grouped certificates only when event and event-group policies both allow them', async () => {
    const eventGroup = {
      id: 'event-group-1',
      name: 'Grouped minicourse',
      emoji: null,
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: false,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdById: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedById: null,
    };
    const groupedEvent = {
      ...event,
      eventGroupId: eventGroup.id,
      eventGroup,
      shouldIssueCertificateForNonPayingAttendees: true,
    };
    const service = new CertificateEligibilityService({
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue(eventGroup),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([groupedEvent]),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            personId: person.id,
            eventId: groupedEvent.id,
            category: AttendanceCategory.NON_REGULAR,
            currentAssessment: 'MAJOR_EVENT_PAYMENT_NOT_CONFIRMED',
            person,
          },
        ]),
      },
    } as never);

    await expect(
      service.resolveEligibleRecipients({
        id: 'config-1',
        scope: CertificateScope.EVENT_GROUP,
        issuedTo: CertificateIssuedTo.ATTENDEE,
        eventGroupId: eventGroup.id,
      } as never),
    ).resolves.toEqual([
      {
        person,
        events: [groupedEvent],
      },
    ]);
  });

  it('rejects non-paying grouped certificates when the event policy disallows them', async () => {
    const eventGroup = {
      id: 'event-group-1',
      name: 'Grouped minicourse',
      emoji: null,
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: false,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdById: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedById: null,
    };
    const groupedEvent = {
      ...event,
      eventGroupId: eventGroup.id,
      eventGroup,
      shouldIssueCertificateForNonPayingAttendees: false,
    };
    const service = new CertificateEligibilityService({
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue(eventGroup),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([groupedEvent]),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            personId: person.id,
            eventId: groupedEvent.id,
            category: AttendanceCategory.NON_REGULAR,
            currentAssessment: 'MAJOR_EVENT_PAYMENT_NOT_CONFIRMED',
            person,
          },
        ]),
      },
    } as never);

    await expect(
      service.resolveEligibleRecipients({
        id: 'config-1',
        scope: CertificateScope.EVENT_GROUP,
        issuedTo: CertificateIssuedTo.ATTENDEE,
        eventGroupId: eventGroup.id,
      } as never),
    ).resolves.toEqual([]);
  });

  it('requires event and event-group non-subscriber policies for per-event certificates in a group', async () => {
    const eventGroup = {
      id: 'event-group-1',
      name: 'Grouped talks',
      emoji: null,
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      shouldIssueCertificateForEachEvent: true,
      shouldIssuePartialCertificate: false,
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdById: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedById: null,
    };
    const groupedEvent = {
      ...event,
      eventGroupId: eventGroup.id,
      eventGroup,
      shouldIssueCertificateForNonSubscribedAttendees: false,
    };
    const service = new CertificateEligibilityService({
      event: {
        findFirst: jest.fn().mockResolvedValue(groupedEvent),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            personId: person.id,
            eventId: groupedEvent.id,
            category: AttendanceCategory.NON_REGULAR,
            currentAssessment: 'ACTIVITY_SUBSCRIPTION_MISSING',
            person,
          },
        ]),
      },
    } as never);

    await expect(
      service.resolveEligibleRecipients({
        id: 'config-1',
        scope: CertificateScope.EVENT,
        issuedTo: CertificateIssuedTo.ATTENDEE,
        eventId: groupedEvent.id,
      } as never),
    ).resolves.toEqual([]);
  });

  it('requires event and event-group non-subscriber policies for grouped events in major-event certificates', async () => {
    const eventGroup = {
      id: 'event-group-1',
      name: 'Grouped talks',
      emoji: null,
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdById: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedById: null,
    };
    const groupedEvent = {
      ...event,
      eventGroupId: eventGroup.id,
      eventGroup,
      shouldIssueCertificateForNonSubscribedAttendees: false,
    };
    const service = new CertificateEligibilityService({
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({
          id: majorEventId,
          isPaymentRequired: false,
          shouldIssueCertificateForNonPayingAttendees: false,
          shouldIssueCertificateForNonSubscribedAttendees: true,
        }),
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
        findMany: jest.fn().mockResolvedValue([groupedEvent]),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            personId: person.id,
            eventId: groupedEvent.id,
            category: AttendanceCategory.NON_REGULAR,
            currentAssessment: 'ACTIVITY_SUBSCRIPTION_MISSING',
            person,
          },
        ]),
      },
    } as never);

    await expect(service.resolveEligibleRecipients(config as never)).resolves.toEqual([]);
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

  it('resolves all lecturer event categories for catch-all lecturer configs', async () => {
    const lecture = { ...event, id: 'lecture-1', type: EventType.PALESTRA };
    const minicourse = { ...event, id: 'minicourse-1', type: EventType.MINICURSO };
    const eventLecturerFindMany = jest.fn().mockResolvedValue([
      { personId: person.id, eventId: lecture.id, person },
      { personId: person.id, eventId: minicourse.id, person },
    ]);
    const service = new CertificateEligibilityService({
      event: {
        findMany: jest.fn().mockResolvedValue([lecture, minicourse]),
      },
      eventLecturer: {
        findMany: eventLecturerFindMany,
      },
    } as never);

    await expect(
      service.resolveEligibleRecipients({
        id: 'config-1',
        scope: CertificateScope.EVENT_GROUP,
        issuedTo: CertificateIssuedTo.LECTURER,
        eventGroupId: 'group-1',
        certificateFields: { __lecturerEventCategory: 'OTHER' },
      } as never),
    ).resolves.toEqual([
      {
        person,
        events: [lecture, minicourse],
      },
    ]);
  });
});
