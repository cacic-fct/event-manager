import { CertificateIssuedTo, CertificateScope, EventType } from '@cacic-fct/shared-data-types';
import { SubscriptionStatus } from '@prisma/client';
import { CertificateEligibilityService } from './certificate-eligibility.service';

describe('CertificateEligibilityService', () => {
  const createService = (
    overrides: Record<string, unknown> = {},
    audienceInvitations = { getEventInvitationFacts: jest.fn().mockResolvedValue(new Map()) },
  ) =>
    new CertificateEligibilityService(
      {
        eventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
        majorEventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
        priceTier: { findMany: jest.fn().mockResolvedValue([]) },
        ...overrides,
      } as never,
      { resolve: jest.fn() } as never,
      audienceInvitations as never,
    );

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

  it('keeps an ANYONE online walk-in out of a REGISTERED_ONLY certificate config', async () => {
    const walkInEvent = { ...event, majorEventId: null, majorEvent: null };
    const service = createService({
      event: { findFirst: jest.fn().mockResolvedValue(walkInEvent) },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            personId: person.id,
            eventId: walkInEvent.id,
            person,
          },
        ]),
      },
    } as never);

    await expect(
      service.resolveEligibleRecipients({
        ...config,
        scope: CertificateScope.EVENT,
        eventId: walkInEvent.id,
        attendeeEligibility: 'REGISTERED_ONLY',
      } as never),
    ).resolves.toEqual([]);
  });

  it('allows an ANYONE certificate config to issue for a registered-policy walk-in', async () => {
    const registeredEvent = { ...event, majorEventId: null, majorEvent: null };
    const service = createService({
      event: { findFirst: jest.fn().mockResolvedValue(registeredEvent) },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            personId: person.id,
            eventId: registeredEvent.id,
            person,
          },
        ]),
      },
    } as never);

    await expect(
      service.resolveEligibleRecipients({
        ...config,
        scope: CertificateScope.EVENT,
        eventId: registeredEvent.id,
        attendeeEligibility: 'ANYONE',
      } as never),
    ).resolves.toEqual([{ person, events: [registeredEvent] }]);
  });

  it.each([true, false])('evaluates INVITED_ONLY certificate eligibility from invite facts (invited=%s)', async (invited) => {
    const walkInEvent = { ...event, majorEventId: null, majorEvent: null };
    const audienceInvitations = {
      getEventInvitationFacts: jest.fn().mockResolvedValue(new Map([
        [`${person.id}:${walkInEvent.id}`, { event: invited, eventGroup: false, majorEvent: false }],
      ])),
    };
    const service = createService({
      event: { findFirst: jest.fn().mockResolvedValue(walkInEvent) },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([{ personId: person.id, eventId: walkInEvent.id, person }]),
      },
    }, audienceInvitations);

    await expect(service.resolveEligibleRecipients({
      ...config,
      scope: CertificateScope.EVENT,
      eventId: walkInEvent.id,
      attendeeEligibility: 'INVITED_ONLY',
    } as never)).resolves.toEqual(invited ? [{ person, events: [walkInEvent] }] : []);
    expect(audienceInvitations.getEventInvitationFacts).toHaveBeenCalledWith([walkInEvent], [person.id]);
  });

  it('requires confirmed major registration for an APPROVED certificate even when the event is free', async () => {
    const majorEvent = { ...event, majorEventId, majorEvent: null };
    const service = createService({
      event: { findFirst: jest.fn().mockResolvedValue(majorEvent) },
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([{ eventId: majorEvent.id, personId: person.id }]),
      },
      majorEventSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            majorEventId,
            personId: person.id,
            subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
            paymentTier: null,
          },
        ]),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            personId: person.id,
            eventId: majorEvent.id,
            person,
          },
        ]),
      },
    } as never);

    await expect(
      service.resolveEligibleRecipients({
        ...config,
        scope: CertificateScope.EVENT,
        eventId: majorEvent.id,
        attendeeEligibility: 'APPROVED_REGISTRATIONS_ONLY',
      } as never),
    ).resolves.toEqual([]);
  });

  it('uses pending selected major registration as REGISTERED evidence but not APPROVED evidence', async () => {
    const pendingEvent = { ...event, majorEventId, majorEvent: null };
    const majorEventSubscriptionFindMany = jest.fn().mockResolvedValue([
      {
        majorEventId,
        personId: person.id,
        subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
        paymentTier: null,
        selectedEvents: [{ eventId: pendingEvent.id }],
      },
    ]);
    const createPendingService = () =>
      createService({
        event: { findFirst: jest.fn().mockResolvedValue(pendingEvent) },
        eventSubscription: { findMany: jest.fn().mockResolvedValue([]) },
        majorEventSubscription: { findMany: majorEventSubscriptionFindMany },
        eventAttendance: {
          findMany: jest.fn().mockResolvedValue([
            { personId: person.id, eventId: pendingEvent.id, person },
          ]),
        },
      } as never);

    await expect(
      createPendingService().resolveEligibleRecipients({
        ...config,
        scope: CertificateScope.EVENT,
        eventId: pendingEvent.id,
        attendeeEligibility: 'REGISTERED_ONLY',
      } as never),
    ).resolves.toEqual([{ person, events: [pendingEvent] }]);
    await expect(
      createPendingService().resolveEligibleRecipients({
        ...config,
        scope: CertificateScope.EVENT,
        eventId: pendingEvent.id,
        attendeeEligibility: 'APPROVED_REGISTRATIONS_ONLY',
      } as never),
    ).resolves.toEqual([]);
    expect(majorEventSubscriptionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          selectedEvents: {
            where: {
              eventId: { in: [pendingEvent.id] },
              deletedAt: null,
            },
            select: { eventId: true },
          },
        }),
      }),
    );
  });

  it('does not treat an ineligible price tier as a payment or subscription certificate exception', async () => {
    const service = createService({
      event: {
        findFirst: jest.fn().mockResolvedValue({
          ...event,
          regularAttendancePriceTierIds: ['tier-aluno'],
          shouldIssueCertificateForNonPayingAttendees: true,
          shouldIssueCertificateForNonSubscribedAttendees: true,
        }),
      },
      majorEventSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            majorEventId,
            personId: person.id,
            subscriptionStatus: SubscriptionStatus.CONFIRMED,
            paymentTier: 'Professor',
          },
        ]),
      },
      priceTier: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tier-aluno',
            name: 'Aluno',
            price: { majorEventId },
          },
        ]),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([{ personId: person.id, person }]),
      },
    });
    await expect(
      service.resolveEligibleRecipients({
        ...config,
        scope: CertificateScope.EVENT,
        eventId: event.id,
      } as never),
    ).resolves.toEqual([]);
  });

  it('filters attendee certificate payment tiers by normalized registration snapshots', async () => {
    const excludedPerson = { ...person, id: 'person-2', name: 'Grace Hopper' };
    const tierEvent = { ...event, regularAttendancePriceTierIds: ['tier-aluno'] };
    const service = createService({
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({
          id: majorEventId,
          isPaymentRequired: false,
          shouldIssueCertificateForNonPayingAttendees: false,
          shouldIssueCertificateForNonSubscribedAttendees: false,
        }),
      },
      majorEventSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            majorEventId,
            personId: person.id,
            subscriptionStatus: SubscriptionStatus.CONFIRMED,
            paymentTier: '  aLuno ',
            person,
          },
          {
            majorEventId,
            personId: excludedPerson.id,
            subscriptionStatus: SubscriptionStatus.CONFIRMED,
            paymentTier: 'Professor',
            person: excludedPerson,
          },
        ]),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([tierEvent]),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          { personId: person.id, eventId: tierEvent.id, person },
          { personId: excludedPerson.id, eventId: tierEvent.id, person: excludedPerson },
        ]),
      },
      priceTier: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tier-aluno',
            name: ' Aluno ',
            price: { majorEventId },
          },
        ]),
      },
    });

    await expect(
      service.resolveEligibleRecipients({ ...config, paymentTiers: [' ALUNO '] } as never),
    ).resolves.toEqual([{ person, events: [tierEvent] }]);
  });

  it.each([CertificateIssuedTo.LECTURER, CertificateIssuedTo.OTHER, CertificateIssuedTo.SPORTS_PLAYER])(
    'does not apply attendee payment tiers to %s recipients',
    async (issuedTo) => {
      const recipients = [{ person, events: [event] }];
      const majorEventSubscription = { findMany: jest.fn() };
      const service = new CertificateEligibilityService({
        people: { findFirst: jest.fn().mockResolvedValue(person) },
        eventLecturer: { findMany: jest.fn().mockResolvedValue([{ personId: person.id, eventId: event.id, person }]) },
        majorEventSubscription,
      } as never, { resolve: jest.fn().mockResolvedValue(recipients) } as never,
      { getEventInvitationFacts: jest.fn().mockResolvedValue(new Map()) } as never);
      await expect(
        service.resolveEligibleRecipients({
          ...config,
          scope: CertificateScope.EVENT,
          eventId: event.id,
          event,
          issuedTo,
          paymentTiers: ['Aluno'],
          attendeeEligibility: 'INVITED_ONLY',
        } as never, person.id),
      ).resolves.toEqual(recipients);
      expect(majorEventSubscription.findMany).not.toHaveBeenCalled();
    },
  );

  it('skips confirmed major-event subscribers with no event attendance', async () => {
    const service = createService({
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
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([{ eventId: event.id, personId: person.id }]),
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
    const service = createService({
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
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([{ eventId: event.id, personId: person.id }]),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([event]),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            personId: person.id,
            eventId: event.id,
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
    const service = createService({
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
    const service = createService({
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
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue(
          groupedEvents.map((groupedEvent) => ({ eventId: groupedEvent.id, personId: person.id })),
        ),
      },
      event: {
        findMany: jest.fn().mockResolvedValue(groupedEvents),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue(
          groupedEvents.map((groupedEvent) => ({
            personId: person.id,
            eventId: groupedEvent.id,
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

  it('requires both event and event-group non-subscriber policies for grouped certificates', async () => {
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
        allowSubscription: true,
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
        allowSubscription: true,
        shouldIssueCertificateForNonSubscribedAttendees: false,
      },
    ];
    const service = createService({
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

  it('allows non-subscriber grouped attendance when both target flags allow it', async () => {
    const eventGroup = {
      id: 'event-group-1',
      name: 'Grouped minicourse',
      emoji: null,
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
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
      allowSubscription: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
    };
    const service = createService({
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
    ).resolves.toEqual([{ person, events: [groupedEvent] }]);
  });

  it('rejects non-subscriber grouped certificates when the event policy disallows them', async () => {
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
    const groupedEvent = {
      ...event,
      eventGroupId: eventGroup.id,
      eventGroup,
      allowSubscription: true,
      shouldIssueCertificateForNonSubscribedAttendees: false,
    };
    const service = createService({
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
      allowSubscription: true,
      shouldIssueCertificateForNonSubscribedAttendees: false,
    };
    const service = createService({
      event: {
        findFirst: jest.fn().mockResolvedValue(groupedEvent),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            personId: person.id,
            eventId: groupedEvent.id,
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
      allowSubscription: true,
      shouldIssueCertificateForNonSubscribedAttendees: false,
    };
    const service = createService({
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
            person,
          },
        ]),
      },
    } as never);

    await expect(service.resolveEligibleRecipients(config as never)).resolves.toEqual([]);
  });

  it('keeps the individual-event non-paying exception while applying explicit registration criteria afterward', async () => {
    const eventGroup = {
      id: 'event-group-1',
      name: 'Grouped talks',
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      shouldIssueCertificateForEachEvent: true,
      shouldIssuePartialCertificate: false,
      deletedAt: null,
    };
    const targetEvent = {
      ...event,
      eventGroupId: eventGroup.id,
      eventGroup,
      majorEvent: { isPaymentRequired: true },
      allowSubscription: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
    };
    const createTargetService = (target = targetEvent) =>
      createService({
        event: {
          findFirst: jest.fn().mockResolvedValue(target),
        },
        majorEventSubscription: {
          findMany: jest.fn().mockResolvedValue([
            {
              majorEventId,
              personId: person.id,
              subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
              paymentTier: null,
              selectedEvents: [],
            },
          ]),
        },
        eventAttendance: {
          findMany: jest.fn().mockResolvedValue([{ personId: person.id, person }]),
        },
      });

    await expect(
      createTargetService().resolveEligibleRecipients({
        ...config,
        scope: CertificateScope.EVENT,
        eventId: targetEvent.id,
        attendeeEligibility: 'ANYONE',
      } as never),
    ).resolves.toEqual([{ person, events: [targetEvent] }]);
    await expect(
      createTargetService().resolveEligibleRecipients({
        ...config,
        scope: CertificateScope.EVENT,
        eventId: targetEvent.id,
        attendeeEligibility: 'REGISTERED_ONLY',
      } as never),
    ).resolves.toEqual([]);
    const targetWithoutNonPayingException = {
      ...targetEvent,
      shouldIssueCertificateForNonPayingAttendees: false,
    };
    await expect(
      createTargetService(targetWithoutNonPayingException).resolveEligibleRecipients({
        ...config,
        scope: CertificateScope.EVENT,
        eventId: targetWithoutNonPayingException.id,
        attendeeEligibility: 'ANYONE',
      } as never),
    ).resolves.toEqual([]);
  });

  it('preserves the free major-event open-attendance rule and keeps explicit approval as an additional gate', async () => {
    const openEvent = {
      ...event,
      majorEventId,
      majorEvent: null,
      allowSubscription: false,
    };
    const createOpenService = (majorEventPolicy: Record<string, unknown>) =>
      createService({
        majorEvent: {
          findFirst: jest.fn().mockResolvedValue({
            id: majorEventId,
            isPaymentRequired: false,
            shouldIssueCertificateForNonPayingAttendees: true,
            shouldIssueCertificateForNonSubscribedAttendees: true,
            ...majorEventPolicy,
          }),
        },
        majorEventSubscription: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        event: {
          findMany: jest.fn().mockResolvedValue([openEvent]),
        },
        eventAttendance: {
          findMany: jest.fn().mockResolvedValue([{ personId: person.id, eventId: openEvent.id, person }]),
        },
      });

    await expect(
      createOpenService({}).resolveEligibleRecipients({ ...config, attendeeEligibility: null } as never),
    ).resolves.toEqual([{ person, events: [openEvent] }]);
    await expect(
      createOpenService({}).resolveEligibleRecipients({
        ...config,
        attendeeEligibility: 'APPROVED_REGISTRATIONS_ONLY',
      } as never),
    ).resolves.toEqual([]);
    await expect(
      createOpenService({ shouldIssueCertificateForNonPayingAttendees: false }).resolveEligibleRecipients({
        ...config,
        attendeeEligibility: 'ANYONE',
      } as never),
    ).resolves.toEqual([]);
  });

  it('keeps paid major-event certificates behind the confirmed-subscription prefilter', async () => {
    const majorEventSubscriptionFindMany = jest.fn().mockResolvedValue([]);
    const eventFindMany = jest.fn();
    const service = createService({
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({
          id: majorEventId,
          isPaymentRequired: true,
          shouldIssueCertificateForNonPayingAttendees: true,
          shouldIssueCertificateForNonSubscribedAttendees: true,
        }),
      },
      majorEventSubscription: { findMany: majorEventSubscriptionFindMany },
      event: { findMany: eventFindMany },
    });

    await expect(service.resolveEligibleRecipients({ ...config, attendeeEligibility: 'ANYONE' } as never)).resolves.toEqual([]);
    expect(majorEventSubscriptionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subscriptionStatus: SubscriptionStatus.CONFIRMED }),
      }),
    );
    expect(eventFindMany).not.toHaveBeenCalled();
  });

  it.each([
    [{ eventNonPaying: true, groupNonPaying: true }, true],
    [{ eventNonPaying: false, groupNonPaying: true }, false],
    [{ eventNonPaying: true, groupNonPaying: false }, false],
  ])(
    'applies event and group non-paying flags before the missing event-subscription rule (%j)',
    async ({ eventNonPaying, groupNonPaying }, expected) => {
      const eventGroup = {
        id: 'event-group-1',
        name: 'Grouped talks',
        shouldIssueCertificateForNonPayingAttendees: groupNonPaying,
        shouldIssueCertificateForNonSubscribedAttendees: false,
        shouldIssueCertificateForEachEvent: true,
        shouldIssuePartialCertificate: false,
        deletedAt: null,
      };
      const targetEvent = {
        ...event,
        eventGroupId: eventGroup.id,
        eventGroup,
        majorEvent: { isPaymentRequired: true },
        allowSubscription: true,
        shouldIssueCertificateForNonPayingAttendees: eventNonPaying,
        shouldIssueCertificateForNonSubscribedAttendees: false,
      };
      const service = createService({
        event: { findFirst: jest.fn().mockResolvedValue(targetEvent) },
        majorEventSubscription: {
          findMany: jest.fn().mockResolvedValue([
            {
              majorEventId,
              personId: person.id,
              subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
              paymentTier: null,
              selectedEvents: [],
            },
          ]),
        },
        eventAttendance: {
          findMany: jest.fn().mockResolvedValue([{ personId: person.id, person }]),
        },
      });

      const result = await service.resolveEligibleRecipients({
        ...config,
        scope: CertificateScope.EVENT,
        eventId: targetEvent.id,
        attendeeEligibility: null,
      } as never);
      expect(result).toEqual(expected ? [{ person, events: [targetEvent] }] : []);
    },
  );

  it('requires every grouped event when partial certificates are disabled and preserves the eligible subset otherwise', async () => {
    const eventGroup = {
      id: 'event-group-1',
      name: 'Grouped talks',
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
      deletedAt: null,
    };
    const groupedEvents = [
      {
        ...event,
        id: 'grouped-event-1',
        majorEventId: null,
        majorEvent: null,
        eventGroupId: eventGroup.id,
        eventGroup,
        allowSubscription: true,
        shouldIssueCertificateForNonSubscribedAttendees: true,
      },
      {
        ...event,
        id: 'grouped-event-2',
        majorEventId: null,
        majorEvent: null,
        eventGroupId: eventGroup.id,
        eventGroup,
        allowSubscription: true,
        shouldIssueCertificateForNonSubscribedAttendees: false,
      },
    ];
    const eventGroupFindFirst = jest
      .fn()
      .mockResolvedValueOnce(eventGroup)
      .mockResolvedValueOnce({ ...eventGroup, shouldIssuePartialCertificate: true });
    const service = createService({
      eventGroup: { findFirst: eventGroupFindFirst },
      event: { findMany: jest.fn().mockResolvedValue(groupedEvents) },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue(
          groupedEvents.map((groupedEvent) => ({ personId: person.id, eventId: groupedEvent.id, person })),
        ),
      },
    });

    await expect(
      service.resolveEligibleRecipients({
        id: 'config-1',
        scope: CertificateScope.EVENT_GROUP,
        issuedTo: CertificateIssuedTo.ATTENDEE,
        eventGroupId: eventGroup.id,
      } as never),
    ).resolves.toEqual([]);
    await expect(
      service.resolveEligibleRecipients({
        id: 'config-1',
        scope: CertificateScope.EVENT_GROUP,
        issuedTo: CertificateIssuedTo.ATTENDEE,
        eventGroupId: eventGroup.id,
      } as never),
    ).resolves.toEqual([{ person, events: [groupedEvents[0]] }]);
  });

  it.each(['ANYONE', 'INVITED_ONLY'])('keeps certificate eligibility independent of the online %s policy', async (policy) => {
    const policyEvent = {
      ...event,
      majorEventId: null,
      majorEvent: null,
      allowSubscription: true,
      attendanceEligibility: policy,
      shouldIssueCertificateForNonSubscribedAttendees: false,
    };
    const service = createService({
      event: { findFirst: jest.fn().mockResolvedValue(policyEvent) },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([{ personId: person.id, person }]),
      },
    });

    await expect(
      service.resolveEligibleRecipients({
        ...config,
        scope: CertificateScope.EVENT,
        eventId: policyEvent.id,
        attendeeEligibility: null,
      } as never),
    ).resolves.toEqual([]);
  });

  it('resolves lecturer configs from event lecturers', async () => {
    const eventLecturerFindMany = jest.fn().mockResolvedValue([
      {
        personId: person.id,
        eventId: event.id,
        person,
      },
    ]);
    const service = createService({
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
    const service = createService({
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
