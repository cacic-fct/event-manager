import { AttendanceCategory } from '@prisma/client';
import { AttendanceCategoryService } from './attendance-category.service';

describe('AttendanceCategoryService', () => {
  let service: AttendanceCategoryService;

  beforeEach(() => {
    service = new AttendanceCategoryService({} as never);
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
          category: AttendanceCategory.NON_SUBSCRIBED,
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
          category: AttendanceCategory.NON_PAYING,
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
          category: AttendanceCategory.NON_SUBSCRIBED,
        },
      }),
    );
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
    expect(tx.eventAttendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          personId_eventId: {
            personId: 'person-1',
            eventId: 'major-session-1',
          },
        },
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
    expect(tx.eventAttendance.update).toHaveBeenCalled();
  });
});

function createTx(input: {
  event: {
    id: string;
    allowSubscription: boolean;
    majorEventId: string | null;
    majorEvent: { isPaymentRequired: boolean } | null;
  };
  hasEventSubscription: boolean;
  majorEventSubscriptionStatus?: string;
  attendanceExists?: boolean;
  attendances?: { personId: string; eventId: string }[];
}) {
  return {
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
      findMany: jest.fn().mockResolvedValue(input.attendances ?? []),
    },
    eventSubscription: {
      findFirst: jest.fn().mockResolvedValue(input.hasEventSubscription ? { id: 'subscription-1' } : null),
    },
    majorEventSubscription: {
      findFirst: jest.fn().mockResolvedValue(
        input.majorEventSubscriptionStatus
          ? {
              subscriptionStatus: input.majorEventSubscriptionStatus,
            }
          : null,
      ),
    },
  };
}
