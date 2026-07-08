import { EventFormAudience as ContractAudience } from '@cacic-fct/shared-data-types';
import { ForbiddenException } from '@nestjs/common';
import { EventFormAudience, EventFormTargetType } from '@prisma/client';
import {
  assertPersonCanAnswerLink,
  assertPersonCanViewPublicResults,
  assertPersonIsEventLecturer,
  canPersonAnswerLink,
  canPersonViewPublicResults,
} from './event-form-eligibility';
import type { EventFormLinkRecord } from './event-form-records';

describe('event form eligibility helpers', () => {
  it('allows subscriber-only links when the person is subscribed to the event', async () => {
    const prisma = createPrismaMock();
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });

    await expect(
      canPersonAnswerLink(prisma as never, 'person-1', {
        audience: ContractAudience.SUBSCRIBERS,
        eventId: 'event-1',
        majorEventId: null,
      }),
    ).resolves.toBe(true);

    expect(prisma.eventSubscription.findFirst).toHaveBeenCalledWith({
      where: {
        eventId: 'event-1',
        personId: 'person-1',
        deletedAt: null,
      },
      select: { id: true },
    });
  });

  it('allows attendee-only links when the person attended an event under the major event', async () => {
    const prisma = createPrismaMock();
    prisma.eventAttendance.findFirst.mockResolvedValue({ eventId: 'event-1' });

    await expect(
      canPersonAnswerLink(prisma as never, 'person-1', {
        audience: EventFormAudience.ATTENDEES,
        eventId: null,
        majorEventId: 'major-1',
      }),
    ).resolves.toBe(true);

    expect(prisma.eventAttendance.findFirst).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
        event: {
          majorEventId: 'major-1',
        },
      },
      select: { eventId: true },
    });
  });

  it('allows future subscribers before a target subscription exists', async () => {
    const prisma = createPrismaMock();

    await expect(
      canPersonAnswerLink(
        prisma as never,
        'person-1',
        {
          audience: EventFormAudience.SUBSCRIBERS_OR_ATTENDEES,
          eventId: null,
          majorEventId: null,
        },
        { allowFutureSubscriber: true },
      ),
    ).resolves.toBe(true);

    expect(prisma.eventSubscription.findFirst).not.toHaveBeenCalled();
    expect(prisma.majorEventSubscription.findFirst).not.toHaveBeenCalled();
  });

  it('rejects answer eligibility when the link has no target and future subscribers are not allowed', async () => {
    const prisma = createPrismaMock();

    await expect(
      canPersonAnswerLink(prisma as never, 'person-1', {
        audience: EventFormAudience.SUBSCRIBERS_OR_ATTENDEES,
        eventId: null,
        majorEventId: null,
      }),
    ).resolves.toBe(false);
  });

  it('asserts answer eligibility from link records', async () => {
    const prisma = createPrismaMock();
    const link = createLinkRecord({
      audience: EventFormAudience.SUBSCRIBERS,
      eventId: 'event-1',
    });

    await expect(assertPersonCanAnswerLink(prisma as never, 'person-1', link)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });

    await expect(assertPersonCanAnswerLink(prisma as never, 'person-1', link)).resolves.toBeUndefined();
  });

  it('allows public result access for event and major-event lecturers', async () => {
    const prisma = createPrismaMock();
    prisma.eventLecturer.findUnique.mockResolvedValueOnce({ eventId: 'event-1' });
    prisma.eventLecturer.findFirst.mockResolvedValueOnce({ eventId: 'event-2' });

    await expect(
      canPersonViewPublicResults(prisma as never, 'person-1', {
        eventId: 'event-1',
        majorEventId: null,
      }),
    ).resolves.toBe(true);
    await expect(
      canPersonViewPublicResults(prisma as never, 'person-1', {
        eventId: null,
        majorEventId: 'major-1',
      }),
    ).resolves.toBe(true);

    expect(prisma.eventLecturer.findUnique).toHaveBeenCalledWith({
      where: {
        eventId_personId: {
          eventId: 'event-1',
          personId: 'person-1',
        },
      },
      select: { eventId: true },
    });
    expect(prisma.eventLecturer.findFirst).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
        event: {
          majorEventId: 'major-1',
        },
      },
      select: { eventId: true },
    });
  });

  it('asserts public result access from link records', async () => {
    const prisma = createPrismaMock();
    const link = createLinkRecord({
      eventId: null,
      majorEventId: null,
    });

    await expect(assertPersonCanViewPublicResults(prisma as never, 'person-1', link)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    prisma.majorEventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });

    await expect(
      assertPersonCanViewPublicResults(
        prisma as never,
        'person-1',
        createLinkRecord({
          eventId: null,
          majorEventId: 'major-1',
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('asserts lecturer access for individual events', async () => {
    const prisma = createPrismaMock();

    await expect(assertPersonIsEventLecturer(prisma as never, 'person-1', 'event-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    prisma.eventLecturer.findUnique.mockResolvedValue({ eventId: 'event-1' });

    await expect(assertPersonIsEventLecturer(prisma as never, 'person-1', 'event-1')).resolves.toBeUndefined();
  });
});

function createPrismaMock() {
  return {
    eventAttendance: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    eventLecturer: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    eventSubscription: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    majorEventSubscription: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

function createLinkRecord(overrides: Partial<EventFormLinkRecord> = {}): EventFormLinkRecord {
  const now = new Date('2026-07-07T12:00:00.000Z');

  return {
    id: 'link-1',
    formId: 'form-1',
    targetType: EventFormTargetType.EVENT,
    eventId: 'event-1',
    majorEventId: null,
    event: null,
    majorEvent: null,
    audience: EventFormAudience.SUBSCRIBERS_OR_ATTENDEES,
    insertInSubscriptionFlow: false,
    requiredInSubscriptionFlow: false,
    enforceRequiredAnswers: false,
    displayOrder: 0,
    availableFrom: null,
    availableUntil: null,
    notifyOnPublish: false,
    allowLecturerManualPublish: false,
    lastNotifiedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    form: null,
    eventFormResponses: [],
    _count: {
      responses: 0,
    },
    ...overrides,
  } as EventFormLinkRecord;
}
