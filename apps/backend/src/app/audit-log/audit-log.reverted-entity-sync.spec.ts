import { AuditLogEntityType } from '@prisma/client';
import { synchronizeRevertedAuditEntity } from './audit-log.reverted-entity-sync';

type TypesenseSearchPort = Parameters<typeof synchronizeRevertedAuditEntity>[0];
type AttendanceRealtimePort = Parameters<typeof synchronizeRevertedAuditEntity>[1];

function createTypesenseSearchMock(): jest.Mocked<TypesenseSearchPort> {
  return {
    deletePerson: jest.fn(),
    upsertPerson: jest.fn(),
    deleteEvent: jest.fn(),
    upsertEvent: jest.fn(),
    deleteMajorEvent: jest.fn(),
    upsertMajorEvent: jest.fn(),
    deleteEventGroup: jest.fn(),
    upsertEventGroup: jest.fn(),
    deletePlacePreset: jest.fn(),
    upsertPlacePreset: jest.fn(),
  } as unknown as jest.Mocked<TypesenseSearchPort>;
}

function createAttendanceRealtimeMock(): jest.Mocked<AttendanceRealtimePort> {
  return {
    notifyAllConnectedPeople: jest.fn(),
  } as unknown as jest.Mocked<AttendanceRealtimePort>;
}

describe('synchronizeRevertedAuditEntity', () => {
  it.each([
    [AuditLogEntityType.PERSON, 'upsertPerson'],
    [AuditLogEntityType.EVENT, 'upsertEvent'],
    [AuditLogEntityType.MAJOR_EVENT, 'upsertMajorEvent'],
    [AuditLogEntityType.EVENT_GROUP, 'upsertEventGroup'],
    [AuditLogEntityType.PLACE_PRESET, 'upsertPlacePreset'],
  ] as const)('upserts reverted %s records that are not deleted', async (entityType, upsertMethod) => {
    const typesenseSearch = createTypesenseSearchMock();
    const attendanceRealtime = createAttendanceRealtimeMock();
    const updated = { id: 'entity-1', name: 'Entity 1', deletedAt: null };

    await synchronizeRevertedAuditEntity(typesenseSearch, attendanceRealtime, entityType, 'entity-1', updated);

    expect(typesenseSearch[upsertMethod]).toHaveBeenCalledWith(updated);
  });

  it.each([
    [AuditLogEntityType.PERSON, 'deletePerson', new Date('2026-07-07T15:00:00.000Z')],
    [AuditLogEntityType.EVENT, 'deleteEvent', '2026-07-07T15:00:00.000Z'],
    [AuditLogEntityType.MAJOR_EVENT, 'deleteMajorEvent', new Date('2026-07-07T15:00:00.000Z')],
    [AuditLogEntityType.EVENT_GROUP, 'deleteEventGroup', new Date('2026-07-07T15:00:00.000Z')],
    [AuditLogEntityType.PLACE_PRESET, 'deletePlacePreset', new Date('2026-07-07T15:00:00.000Z')],
  ] as const)('deletes reverted %s records that are deleted', async (entityType, deleteMethod, deletedAt) => {
    const typesenseSearch = createTypesenseSearchMock();
    const attendanceRealtime = createAttendanceRealtimeMock();

    await synchronizeRevertedAuditEntity(
      typesenseSearch,
      attendanceRealtime,
      entityType,
      'entity-1',
      { id: 'entity-1', deletedAt },
    );

    expect(typesenseSearch[deleteMethod]).toHaveBeenCalledWith('entity-1');
  });

  it('notifies connected people after event synchronization', async () => {
    const typesenseSearch = createTypesenseSearchMock();
    const attendanceRealtime = createAttendanceRealtimeMock();

    await synchronizeRevertedAuditEntity(typesenseSearch, attendanceRealtime, AuditLogEntityType.EVENT, 'event-1', {
      id: 'event-1',
      name: 'Event 1',
    });
    await synchronizeRevertedAuditEntity(typesenseSearch, attendanceRealtime, AuditLogEntityType.EVENT, 'event-1', {
      id: 'event-1',
      deletedAt: new Date('2026-07-07T15:00:00.000Z'),
    });

    expect(attendanceRealtime.notifyAllConnectedPeople).toHaveBeenCalledTimes(2);
  });

  it('ignores entity types that do not need synchronization', async () => {
    const typesenseSearch = createTypesenseSearchMock();
    const attendanceRealtime = createAttendanceRealtimeMock();

    await synchronizeRevertedAuditEntity(
      typesenseSearch,
      attendanceRealtime,
      'UNSUPPORTED_ENTITY' as AuditLogEntityType,
      'entity-1',
      { id: 'entity-1' },
    );

    expect(typesenseSearch.upsertPerson).not.toHaveBeenCalled();
    expect(typesenseSearch.deletePerson).not.toHaveBeenCalled();
    expect(attendanceRealtime.notifyAllConnectedPeople).not.toHaveBeenCalled();
  });
});
