import { moveRelations } from './relations';

describe('merge candidate relation movement', () => {
  it('moves non-duplicate relation rows and records a rollback snapshot', async () => {
    const tx = createTransaction();
    const firstDate = new Date('2026-05-21T10:00:00.000Z');
    const secondDate = new Date('2026-05-21T11:00:00.000Z');

    tx.eventAttendance.findMany
      .mockResolvedValueOnce([
        { eventId: 'event-new', attendedAt: firstDate, createdAt: firstDate, createdById: 'actor-1' },
        { eventId: 'event-existing', attendedAt: secondDate, createdAt: secondDate, createdById: null },
      ])
      .mockResolvedValueOnce([{ eventId: 'event-existing' }]);
    tx.eventLecturer.findMany
      .mockResolvedValueOnce([
        { eventId: 'lecture-new', createdAt: firstDate, createdById: 'actor-2' },
        { eventId: 'lecture-existing', createdAt: secondDate, createdById: null },
      ])
      .mockResolvedValueOnce([{ eventId: 'lecture-existing' }]);
    tx.eventSubscription.findMany.mockResolvedValue([{ id: 'event-subscription-1' }]);
    tx.eventGroupSubscription.findMany.mockResolvedValue([{ id: 'group-subscription-1' }]);
    tx.majorEventSubscription.findMany.mockResolvedValue([{ id: 'major-subscription-1' }]);

    await expect(moveRelations(tx as never, 'target-person', 'source-person')).resolves.toEqual({
      sourceAttendances: [
        {
          eventId: 'event-new',
          attendedAt: '2026-05-21T10:00:00.000Z',
          createdAt: '2026-05-21T10:00:00.000Z',
          createdById: 'actor-1',
        },
        {
          eventId: 'event-existing',
          attendedAt: '2026-05-21T11:00:00.000Z',
          createdAt: '2026-05-21T11:00:00.000Z',
          createdById: null,
        },
      ],
      sourceLectures: [
        {
          eventId: 'lecture-new',
          createdAt: '2026-05-21T10:00:00.000Z',
          createdById: 'actor-2',
        },
        {
          eventId: 'lecture-existing',
          createdAt: '2026-05-21T11:00:00.000Z',
          createdById: null,
        },
      ],
      insertedAttendanceEventIds: ['event-new'],
      insertedLectureEventIds: ['lecture-new'],
      movedEventSubscriptionIds: ['event-subscription-1'],
      movedEventGroupSubscriptionIds: ['group-subscription-1'],
      movedMajorEventSubscriptionIds: ['major-subscription-1'],
    });

    expect(tx.eventAttendance.createMany).toHaveBeenCalledWith({
      data: [
        {
          personId: 'target-person',
          eventId: 'event-new',
          attendedAt: firstDate,
          createdAt: firstDate,
          createdById: 'actor-1',
        },
      ],
      skipDuplicates: true,
    });
    expect(tx.eventLecturer.createMany).toHaveBeenCalledWith({
      data: [
        {
          personId: 'target-person',
          eventId: 'lecture-new',
          createdAt: firstDate,
          createdById: 'actor-2',
        },
      ],
      skipDuplicates: true,
    });
    expect(tx.eventAttendance.deleteMany).toHaveBeenCalledWith({ where: { personId: 'source-person' } });
    expect(tx.eventLecturer.deleteMany).toHaveBeenCalledWith({ where: { personId: 'source-person' } });
    expect(tx.eventSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['event-subscription-1'] } },
      data: { personId: 'target-person' },
    });
  });

  it('skips writes when there are no source relations', async () => {
    const tx = createTransaction();

    await expect(moveRelations(tx as never, 'target-person', 'source-person')).resolves.toEqual({
      sourceAttendances: [],
      sourceLectures: [],
      insertedAttendanceEventIds: [],
      insertedLectureEventIds: [],
      movedEventSubscriptionIds: [],
      movedEventGroupSubscriptionIds: [],
      movedMajorEventSubscriptionIds: [],
    });

    expect(tx.eventAttendance.createMany).not.toHaveBeenCalled();
    expect(tx.eventAttendance.deleteMany).not.toHaveBeenCalled();
    expect(tx.eventSubscription.updateMany).not.toHaveBeenCalled();
  });
});

function createTransaction() {
  return {
    eventAttendance: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    eventLecturer: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    eventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    eventGroupSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    majorEventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
  };
}
