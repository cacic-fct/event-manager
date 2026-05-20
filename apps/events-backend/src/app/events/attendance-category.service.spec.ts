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
}) {
  return {
    eventAttendance: {
      findUnique: jest.fn().mockResolvedValue({
        personId: 'person-1',
        event: input.event,
      }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
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
