import { Injectable, inject } from '@angular/core';
import { liveQuery } from 'dexie';
import { Observable, from, of } from 'rxjs';
import {
  OfflineOralAttendanceDecision,
  OfflineOralAttendancePerson,
} from './offline-public-data-schema';
import { OfflinePublicDatabaseProvider } from './offline-public-database-provider';

const SYNCED_DECISION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class OralAttendanceOfflineService {
  private readonly databaseProvider = inject(OfflinePublicDatabaseProvider);

  async cacheRoster(userId: string, eventId: string, people: readonly OfflineOralAttendancePerson[]): Promise<void> {
    await this.databaseProvider.getDatabase()?.oralAttendanceRosters.put({
      key: `${userId}:${eventId}`,
      userId,
      eventId,
      cachedAt: Date.now(),
      people: [...people],
    });
  }

  async getRoster(userId: string, eventId: string): Promise<OfflineOralAttendancePerson[]> {
    return (
      (await this.databaseProvider.getDatabase()?.oralAttendanceRosters.get(`${userId}:${eventId}`))?.people ?? []
    );
  }

  async enqueue(
    decision: Omit<OfflineOralAttendanceDecision, 'clientId' | 'queuedAt' | 'attempts'>,
  ): Promise<OfflineOralAttendanceDecision> {
    const database = this.databaseProvider.getDatabase();
    const item: OfflineOralAttendanceDecision = {
      ...decision,
      clientId: this.createClientId(),
      queuedAt: Date.now(),
      attempts: 0,
      syncedAt: null,
    };
    if (!database) {
      return item;
    }
    await database.transaction('rw', database.oralAttendanceDecisions, async () => {
      const previous = await database.oralAttendanceDecisions
        .where('[queuedByUserId+eventId+personId]')
        .equals([decision.queuedByUserId, decision.eventId, decision.personId])
        .primaryKeys();
      if (previous.length) {
        await database.oralAttendanceDecisions.bulkDelete(previous);
      }
      await database.oralAttendanceDecisions.put(item);
    });
    return item;
  }

  listPending(userId: string, eventId?: string): Promise<OfflineOralAttendanceDecision[]> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return Promise.resolve([]);
    }
    const collection = eventId
      ? database.oralAttendanceDecisions.where('[queuedByUserId+eventId]').equals([userId, eventId])
      : database.oralAttendanceDecisions.where('queuedByUserId').equals(userId);
    return collection.filter((item) => !item.syncedAt).sortBy('queuedAt');
  }

  listAll(userId: string, eventId: string): Promise<OfflineOralAttendanceDecision[]> {
    return (
      this.databaseProvider
        .getDatabase()
        ?.oralAttendanceDecisions.where('[queuedByUserId+eventId]')
        .equals([userId, eventId])
        .sortBy('queuedAt') ?? Promise.resolve([])
    );
  }

  watchPending(userId: string, eventId: string): Observable<OfflineOralAttendanceDecision[]> {
    const database = this.databaseProvider.getDatabase();
    return database
      ? from(
          liveQuery(() =>
            database.oralAttendanceDecisions
              .where('[queuedByUserId+eventId]')
              .equals([userId, eventId])
              .filter((item) => !item.syncedAt)
              .sortBy('queuedAt'),
          ),
        )
      : of([]);
  }

  async remove(clientIds: readonly string[]): Promise<void> {
    if (clientIds.length) {
      await this.databaseProvider.getDatabase()?.oralAttendanceDecisions.bulkDelete([...clientIds]);
    }
  }

  async markSynced(clientIds: readonly string[]): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }
    const syncedAt = Date.now();
    await database.transaction('rw', database.oralAttendanceDecisions, async () => {
      await Promise.all(
        clientIds.map((clientId) =>
          database.oralAttendanceDecisions.update(clientId, { syncedAt, lastError: null }),
        ),
      );
      const expiredIds = await database.oralAttendanceDecisions
        .filter(
          (item) =>
            item.syncedAt != null && item.syncedAt < syncedAt - SYNCED_DECISION_RETENTION_MS,
        )
        .primaryKeys();
      if (expiredIds.length) {
        await database.oralAttendanceDecisions.bulkDelete(expiredIds);
      }
    });
  }

  async recordFailure(clientIds: readonly string[], message: string): Promise<void> {
    const table = this.databaseProvider.getDatabase()?.oralAttendanceDecisions;
    if (!table) {
      return;
    }
    for (const clientId of clientIds) {
      const item = await table.get(clientId);
      if (item) {
        await table.update(clientId, { attempts: item.attempts + 1, lastError: message });
      }
    }
  }

  private createClientId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
