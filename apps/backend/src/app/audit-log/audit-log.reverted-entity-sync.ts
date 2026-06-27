import { AuditLogEntityType } from '@prisma/client';
import { CurrentUserOnlineAttendanceRealtimeService } from '../current-user/events/attendance-realtime.service';
import { TypesenseSearchService } from '../search/typesense-search.service';

export async function synchronizeRevertedAuditEntity(
  typesenseSearch: TypesenseSearchService,
  attendanceRealtime: CurrentUserOnlineAttendanceRealtimeService,
  entityType: AuditLogEntityType,
  entityId: string,
  updated: Record<string, unknown>,
): Promise<void> {
  const isDeleted = updated['deletedAt'] instanceof Date || typeof updated['deletedAt'] === 'string';

  switch (entityType) {
    case AuditLogEntityType.PERSON:
      if (isDeleted) {
        await typesenseSearch.deletePerson(entityId);
        return;
      }
      await typesenseSearch.upsertPerson(updated as Parameters<TypesenseSearchService['upsertPerson']>[0]);
      return;
    case AuditLogEntityType.EVENT:
      if (isDeleted) {
        await typesenseSearch.deleteEvent(entityId);
      } else {
        await typesenseSearch.upsertEvent(updated as Parameters<TypesenseSearchService['upsertEvent']>[0]);
      }
      await attendanceRealtime.notifyAllConnectedPeople();
      return;
    case AuditLogEntityType.MAJOR_EVENT:
      if (isDeleted) {
        await typesenseSearch.deleteMajorEvent(entityId);
        return;
      }
      await typesenseSearch.upsertMajorEvent(updated as Parameters<TypesenseSearchService['upsertMajorEvent']>[0]);
      return;
    case AuditLogEntityType.EVENT_GROUP:
      if (isDeleted) {
        await typesenseSearch.deleteEventGroup(entityId);
        return;
      }
      await typesenseSearch.upsertEventGroup(updated as Parameters<TypesenseSearchService['upsertEventGroup']>[0]);
      return;
    case AuditLogEntityType.PLACE_PRESET:
      if (isDeleted) {
        await typesenseSearch.deletePlacePreset(entityId);
        return;
      }
      await typesenseSearch.upsertPlacePreset(updated as Parameters<TypesenseSearchService['upsertPlacePreset']>[0]);
      return;
    default:
      return;
  }
}
