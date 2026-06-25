import { ConflictException } from '@nestjs/common';
import { parseMovedRelations, parsePersonSnapshot, toPersonSnapshot, toPersonUpdateData } from './snapshots';

describe('merge candidate snapshot helpers', () => {
  it('serializes and restores person snapshots', () => {
    const source = person({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      secondaryEmails: ['alt@example.com'],
      identityDocument: '52998224725',
      academicId: 'RA1',
      userId: 'user-1',
      externalRef: 'ext-1',
      mergedIntoId: 'target-1',
      deletedAt: new Date('2026-05-21T12:00:00.000Z'),
    });

    const snapshot = toPersonSnapshot(source);

    expect(snapshot).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      secondaryEmails: ['alt@example.com'],
      identityDocument: '52998224725',
      academicId: 'RA1',
      userId: 'user-1',
      externalRef: 'ext-1',
      mergedIntoId: 'target-1',
      deletedAt: '2026-05-21T12:00:00.000Z',
    });
    expect(toPersonUpdateData(snapshot)).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      secondaryEmails: ['alt@example.com'],
      identityDocument: '52998224725',
      academicId: 'RA1',
      userId: 'user-1',
      externalRef: 'ext-1',
      mergedIntoId: 'target-1',
      deletedAt: new Date('2026-05-21T12:00:00.000Z'),
    });
  });

  it('parses legacy person snapshots without secondary emails', () => {
    expect(
      parsePersonSnapshot(
        {
          name: 'Grace Hopper',
          email: null,
          identityDocument: null,
          academicId: null,
          userId: null,
          externalRef: null,
          mergedIntoId: null,
          deletedAt: null,
        },
        'sourceSnapshot',
      ),
    ).toEqual({
      name: 'Grace Hopper',
      email: null,
      secondaryEmails: [],
      identityDocument: null,
      academicId: null,
      userId: null,
      externalRef: null,
      mergedIntoId: null,
      deletedAt: null,
    });
  });

  it('parses moved relation payloads with optional group subscription ids', () => {
    expect(
      parseMovedRelations({
        sourceAttendances: [
          {
            eventId: 'event-1',
            attendedAt: '2026-05-21T12:00:00.000Z',
            createdAt: '2026-05-21T11:00:00.000Z',
            createdById: null,
          },
        ],
        sourceLectures: [
          {
            eventId: 'event-2',
            createdAt: '2026-05-21T10:00:00.000Z',
            createdById: 'actor-1',
          },
        ],
        insertedAttendanceEventIds: ['event-1'],
        insertedLectureEventIds: ['event-2'],
        movedEventSubscriptionIds: ['subscription-1'],
        movedMajorEventSubscriptionIds: ['major-subscription-1'],
      }),
    ).toEqual({
      sourceAttendances: [
        {
          eventId: 'event-1',
          attendedAt: '2026-05-21T12:00:00.000Z',
          createdAt: '2026-05-21T11:00:00.000Z',
          createdById: null,
          committedById: null,
        },
      ],
      sourceLectures: [
        {
          eventId: 'event-2',
          createdAt: '2026-05-21T10:00:00.000Z',
          createdById: 'actor-1',
        },
      ],
      insertedAttendanceEventIds: ['event-1'],
      insertedLectureEventIds: ['event-2'],
      movedEventSubscriptionIds: ['subscription-1'],
      movedEventGroupSubscriptionIds: [],
      movedMajorEventSubscriptionIds: ['major-subscription-1'],
    });
  });

  it('rejects malformed snapshot payloads', () => {
    expect(() => parsePersonSnapshot(null, 'targetSnapshot')).toThrow(ConflictException);
    expect(() =>
      parseMovedRelations({
        sourceAttendances: [{}],
        sourceLectures: [],
        insertedAttendanceEventIds: [],
        insertedLectureEventIds: [],
        movedEventSubscriptionIds: [],
        movedMajorEventSubscriptionIds: [],
      }),
    ).toThrow(ConflictException);
  });
});

function person(overrides: Partial<ReturnType<typeof personShape>>) {
  return {
    ...personShape(),
    ...overrides,
  } as never;
}

function personShape() {
  return {
    id: 'person-1',
    name: 'Person Name',
    email: null,
    secondaryEmails: [] as string[],
    phone: null,
    identityDocument: null,
    academicId: null,
    userId: null,
    mergedIntoId: null,
    externalRef: null,
    deletedAt: null as Date | null,
    createdAt: new Date('2026-05-21T12:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-05-21T12:00:00.000Z'),
    updatedById: null,
    isCPF: null,
  };
}
