import { AttendanceCategory } from '@prisma/client';
import { AttendanceCurrentAssessment } from '@cacic-fct/shared-data-types';
import { AttendanceCategoryService } from './attendance-category.service';

describe('AttendanceCategoryService', () => {
  let service: AttendanceCategoryService;

  beforeEach(() => {
    service = new AttendanceCategoryService({} as never);
  });

  it.each([
    ['Kit completo', 'CONFIRMED', AttendanceCategory.REGULAR, AttendanceCurrentAssessment.REQUIREMENTS_CURRENTLY_MET],
    ['  KIT COMPLETO  ', 'CONFIRMED', AttendanceCategory.REGULAR, AttendanceCurrentAssessment.REQUIREMENTS_CURRENTLY_MET],
    ['Sem kit', 'CONFIRMED', AttendanceCategory.NON_REGULAR, AttendanceCurrentAssessment.PRICE_TIER_NOT_ELIGIBLE],
    [undefined, 'CONFIRMED', AttendanceCategory.NON_REGULAR, AttendanceCurrentAssessment.PRICE_TIER_NOT_ELIGIBLE],
    [undefined, undefined, AttendanceCategory.NON_REGULAR, AttendanceCurrentAssessment.PRICE_TIER_NOT_ELIGIBLE],
    ['Kit completo', 'WAITING_RECEIPT_UPLOAD', AttendanceCategory.NON_REGULAR, AttendanceCurrentAssessment.MAJOR_EVENT_PAYMENT_AWAITING_RECEIPT],
  ])('classifies tier %s with status %s as %s without removing attendance', async (paymentTier, status, category, currentAssessment) => {
    const tx = createTx({
      event: {
        id: 'kit-event',
        allowSubscription: false,
        majorEventId: 'major-event',
        majorEvent: { isPaymentRequired: true },
        regularAttendancePriceTierIds: ['kit-tier'],
      },
      hasEventSubscription: false,
      paymentTier,
      majorEventSubscriptionStatus: status,
    });

    await service.refreshForAttendance('person-1', 'kit-event', tx as never);

    expect(tx.eventAttendance.update).toHaveBeenCalledWith(expect.objectContaining({ data: { category, currentAssessment } }));
    expect(tx.priceTier.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['kit-tier'] }, price: { majorEventId: 'major-event' } },
    }));
  });

  it('reclassifies existing attendance when an event policy changes', async () => {
    const tx = createTx({
      event: {
        id: 'event-1', allowSubscription: false, majorEventId: 'major-event',
        majorEvent: { isPaymentRequired: false }, regularAttendancePriceTierIds: ['kit-tier'],
      },
      hasEventSubscription: false,
      majorEventSubscriptionStatus: 'CONFIRMED',
      paymentTier: 'Sem kit',
      attendances: [{ eventId: 'event-1', personId: 'person-1' }],
    });
    await service.refreshForEvent('event-1', tx as never);
    expect(tx.eventAttendance.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { category: AttendanceCategory.NON_REGULAR, currentAssessment: AttendanceCurrentAssessment.PRICE_TIER_NOT_ELIGIBLE },
    }));
    tx.eventAttendance.findMany.mockResolvedValue([
      {
        personId: 'person-1',
        eventId: 'event-1',
        event: {
          id: 'event-1',
          allowSubscription: false,
          majorEventId: 'major-event',
          majorEvent: { isPaymentRequired: false },
          regularAttendancePriceTierIds: [],
        },
      },
    ]);
    await service.refreshForEvent('event-1', tx as never);
    expect(tx.eventAttendance.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { category: AttendanceCategory.REGULAR, currentAssessment: AttendanceCurrentAssessment.REQUIREMENTS_CURRENTLY_MET },
    }));
  });

  it('classifies a subscribed standalone event attendance as regular', async () => {
    const tx = createTx({
      event: {
        id: 'standalone-event',
        allowSubscription: true,
        majorEventId: null,
        majorEvent: null,
      },
      hasEventSubscription: true,
    });

    await service.refreshForAttendance('person-1', 'standalone-event', tx as never);

    expect(tx.eventAttendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          category: AttendanceCategory.REGULAR,
          currentAssessment: AttendanceCurrentAssessment.REQUIREMENTS_CURRENTLY_MET,
        },
      }),
    );
  });

  it('classifies an unsubscribed standalone event attendance as non-subscribed', async () => {
    const tx = createTx({
      event: {
        id: 'standalone-event',
        allowSubscription: true,
        majorEventId: null,
        majorEvent: null,
      },
      hasEventSubscription: false,
    });

    await service.refreshForAttendance('person-1', 'standalone-event', tx as never);

    expect(tx.eventAttendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          category: AttendanceCategory.NON_REGULAR,
          currentAssessment: 'ACTIVITY_SUBSCRIPTION_MISSING',
        },
      }),
    );
  });

  it('classifies attendance for events without subscriptions as regular', async () => {
    const tx = createTx({
      event: {
        id: 'open-event',
        allowSubscription: false,
        majorEventId: null,
        majorEvent: null,
      },
      hasEventSubscription: false,
    });

    await service.refreshForAttendance('person-1', 'open-event', tx as never);

    expect(tx.eventAttendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          category: AttendanceCategory.REGULAR,
          currentAssessment: AttendanceCurrentAssessment.REQUIREMENTS_CURRENTLY_MET,
        },
      }),
    );
  });

  it('keeps paid major-event attendees without confirmed payment as non-paying', async () => {
    const tx = createTx({
      event: {
        id: 'major-event-session',
        allowSubscription: true,
        majorEventId: 'major-event',
        majorEvent: {
          isPaymentRequired: true,
        },
      },
      hasEventSubscription: true,
      majorEventSubscriptionStatus: 'RECEIPT_UNDER_REVIEW',
    });

    await service.refreshForAttendance('person-1', 'major-event-session', tx as never);

    expect(tx.eventAttendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          category: AttendanceCategory.NON_REGULAR,
          currentAssessment: 'MAJOR_EVENT_PAYMENT_UNDER_REVIEW',
        },
      }),
    );
  });

  it('classifies confirmed major-event attendees outside selected sessions as non-subscribed', async () => {
    const tx = createTx({
      event: {
        id: 'major-event-session',
        allowSubscription: true,
        majorEventId: 'major-event',
        majorEvent: {
          isPaymentRequired: true,
        },
      },
      hasEventSubscription: false,
      majorEventSubscriptionStatus: 'CONFIRMED',
    });

    await service.refreshForAttendance('person-1', 'major-event-session', tx as never);

    expect(tx.eventAttendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          category: AttendanceCategory.NON_REGULAR,
          currentAssessment: 'ACTIVITY_SUBSCRIPTION_MISSING',
        },
      }),
    );
  });

  it('derives current assessments for legacy undefined attendances without changing their stored category', async () => {
    const tx = {
      event: { findMany: jest.fn().mockResolvedValue([]) },
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      majorEventSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            personId: 'person-1',
            majorEventId: 'major-event',
            subscriptionStatus: 'WAITING_RECEIPT_UPLOAD',
          },
        ]),
      },
    };

    const assessments = await service.resolveCurrentAssessments(
      [
        {
          personId: 'person-1',
          eventId: 'event-1',
          category: AttendanceCategory.UNKNOWN,
          event: {
            allowSubscription: true,
            majorEventId: 'major-event',
            majorEvent: { isPaymentRequired: true },
          },
        },
        {
          personId: 'person-2',
          eventId: 'event-2',
          category: AttendanceCategory.UNKNOWN,
          event: {
            allowSubscription: true,
            majorEventId: null,
            majorEvent: null,
          },
        },
      ],
      tx as never,
    );

    expect(assessments).toEqual(
      new Map([
        ['person-1:event-1', AttendanceCurrentAssessment.MAJOR_EVENT_PAYMENT_AWAITING_RECEIPT],
        ['person-2:event-2', AttendanceCurrentAssessment.ACTIVITY_SUBSCRIPTION_MISSING],
      ]),
    );
    expect(tx.eventSubscription.findMany).toHaveBeenCalledTimes(1);
    expect(tx.majorEventSubscription.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not update when the attendance no longer exists', async () => {
    const tx = createTx({
      event: {
        id: 'event-1',
        allowSubscription: false,
        majorEventId: null,
        majorEvent: null,
      },
      hasEventSubscription: false,
      attendanceExists: false,
    });

    await service.refreshForAttendance('person-1', 'event-1', tx as never);

    expect(tx.eventAttendance.update).not.toHaveBeenCalled();
  });

  it('refreshes every attendance for a major event person', async () => {
    const tx = createTx({
      event: {
        id: 'major-session-1',
        allowSubscription: false,
        majorEventId: 'major-event',
        majorEvent: { isPaymentRequired: false },
      },
      hasEventSubscription: false,
      attendances: [{ personId: 'person-1', eventId: 'major-session-1' }],
    });

    await service.refreshForMajorEventPerson('major-event', 'person-1', tx as never);

    expect(tx.eventAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          personId: 'person-1',
          event: {
            majorEventId: 'major-event',
            deletedAt: null,
          },
        },
      }),
    );
    expect(tx.eventAttendance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ personId: 'person-1', eventId: 'major-session-1' }] },
      }),
    );
  });

  it('skips event/person batch refresh when either side is empty', async () => {
    const tx = createTx({
      event: {
        id: 'event-1',
        allowSubscription: false,
        majorEventId: null,
        majorEvent: null,
      },
      hasEventSubscription: false,
    });

    await service.refreshForEventPersons([], ['person-1'], tx as never);
    await service.refreshForEventPersons(['event-1'], [], tx as never);

    expect(tx.eventAttendance.findMany).not.toHaveBeenCalled();
  });

  it('refreshes event/person batches from matching attendance rows', async () => {
    const tx = createTx({
      event: {
        id: 'event-1',
        allowSubscription: false,
        majorEventId: null,
        majorEvent: null,
      },
      hasEventSubscription: false,
      attendances: [{ personId: 'person-1', eventId: 'event-1' }],
    });

    await service.refreshForEventPersons(['event-1'], ['person-1'], tx as never);

    expect(tx.eventAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: {
            in: ['event-1'],
          },
          personId: {
            in: ['person-1'],
          },
        },
      }),
    );
    expect(tx.eventAttendance.updateMany).toHaveBeenCalled();
  });

  it('uses bounded reads and grouped writes for large attendance batches', async () => {
    const attendances = Array.from({ length: 1001 }, (_, index) => ({
      personId: `person-${index}`,
      eventId: 'event-1',
    }));
    const tx = createTx({
      event: {
        id: 'event-1',
        allowSubscription: false,
        majorEventId: null,
        majorEvent: null,
      },
      hasEventSubscription: false,
      attendances,
    });

    await service.refreshForEvent('event-1', tx as never);

    expect(tx.eventAttendance.findMany).toHaveBeenCalledTimes(1);
    expect(tx.eventSubscription.findMany).toHaveBeenCalledTimes(1);
    expect(tx.eventAttendance.findUnique).not.toHaveBeenCalled();
    expect(tx.eventAttendance.updateMany).toHaveBeenCalledTimes(3);
    expect(tx.eventAttendance.update).not.toHaveBeenCalled();
  });

  it('keeps tier eligibility scoped to each event policy in a shared batch', async () => {
    const eventOne = {
      id: 'event-1',
      allowSubscription: false,
      majorEventId: 'major-event',
      majorEvent: { isPaymentRequired: false },
      regularAttendancePriceTierIds: ['tier-one'],
    };
    const eventTwo = {
      ...eventOne,
      id: 'event-2',
      regularAttendancePriceTierIds: ['tier-two'],
    };
    const tx = {
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([
          { personId: 'person-1', eventId: 'event-1', event: eventOne },
          { personId: 'person-2', eventId: 'event-2', event: eventTwo },
        ]),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      majorEventSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            personId: 'person-1',
            majorEventId: 'major-event',
            paymentTier: 'Kit completo',
            subscriptionStatus: 'CONFIRMED',
          },
          {
            personId: 'person-2',
            majorEventId: 'major-event',
            paymentTier: 'Kit completo',
            subscriptionStatus: 'CONFIRMED',
          },
        ]),
        findFirst: jest.fn(),
      },
      priceTier: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'tier-one', name: 'Kit completo', price: { majorEventId: 'major-event' } },
          { id: 'tier-two', name: 'Outro kit', price: { majorEventId: 'major-event' } },
        ]),
      },
    };

    await service.refreshForEventPersons(['event-1', 'event-2'], ['person-1', 'person-2'], tx as never);

    expect(tx.eventAttendance.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.eventAttendance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        category: AttendanceCategory.REGULAR,
        currentAssessment: AttendanceCurrentAssessment.REQUIREMENTS_CURRENTLY_MET,
      },
      where: { OR: [{ personId: 'person-1', eventId: 'event-1' }] },
    }));
    expect(tx.eventAttendance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        category: AttendanceCategory.NON_REGULAR,
        currentAssessment: AttendanceCurrentAssessment.PRICE_TIER_NOT_ELIGIBLE,
      },
      where: { OR: [{ personId: 'person-2', eventId: 'event-2' }] },
    }));
  });
});

function createTx(input: {
  event: {
    id: string;
    regularAttendancePriceTierIds?: string[];
    allowSubscription: boolean;
    majorEventId: string | null;
    majorEvent: { isPaymentRequired: boolean } | null;
  };
  paymentTier?: string;
  hasEventSubscription: boolean;
  majorEventSubscriptionStatus?: string;
  attendanceExists?: boolean;
  attendances?: { personId: string; eventId: string }[];
}) {
  return {
    priceTier: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'kit-tier', name: 'Kit completo', price: { majorEventId: 'major-event' } }]),
    },
    eventAttendance: {
      findUnique: jest.fn().mockResolvedValue(
        input.attendanceExists === false
          ? null
          : {
              personId: 'person-1',
              event: input.event,
            },
      ),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: input.attendances?.length ?? 0 }),
      findMany: jest.fn().mockResolvedValue(
        (input.attendances ?? []).map((attendance) => ({
          ...attendance,
          event: input.event,
        })),
      ),
    },
    eventSubscription: {
      findMany: jest.fn().mockResolvedValue(
        input.hasEventSubscription ? [{ eventId: input.event.id, personId: 'person-1' }] : [],
      ),
      findFirst: jest.fn().mockResolvedValue(input.hasEventSubscription ? { id: 'subscription-1' } : null),
    },
    majorEventSubscription: {
      findMany: jest.fn().mockResolvedValue(
        input.majorEventSubscriptionStatus
          ? [
              {
                majorEventId: input.event.majorEventId,
                personId: 'person-1',
                paymentTier: input.paymentTier,
                subscriptionStatus: input.majorEventSubscriptionStatus,
              },
            ]
          : [],
      ),
      findFirst: jest.fn().mockResolvedValue(
        input.majorEventSubscriptionStatus
          ? {
              subscriptionStatus: input.majorEventSubscriptionStatus,
              paymentTier: input.paymentTier,
            }
          : null,
      ),
    },
  };
}
