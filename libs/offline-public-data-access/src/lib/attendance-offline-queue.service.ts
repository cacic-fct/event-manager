import { Injectable, inject } from '@angular/core';
import { liveQuery } from 'dexie';
import { Observable, from, of } from 'rxjs';
import {
  OfflineAttendanceCollectionEventRecord,
  OfflineAttendanceQueueItem,
  OfflineAttendanceQueueStatus,
} from './offline-public-data-schema';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { OfflinePublicDatabaseProvider } from './offline-public-database-provider';

export interface OfflineAttendanceCommitResultLike {
  clientId: string;
  status: 'CREATED' | 'STAGED' | 'DUPLICATE' | 'CONFLICT' | 'FORBIDDEN' | 'FAILED';
  message?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AttendanceOfflineQueueService {
  private readonly databaseProvider = inject(OfflinePublicDatabaseProvider);
  private readonly startupSyncingResetByUserId = new Map<string, Promise<void>>();

  async replaceCollectionEvents(
    userId: string,
    events: readonly { eventId: string; event: PublicEvent }[],
  ): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    const cachedAt = Date.now();
    await database.transaction('rw', database.attendanceCollectionEvents, async () => {
      await database.attendanceCollectionEvents.where('userId').equals(userId).delete();
      if (events.length === 0) {
        return;
      }

      await database.attendanceCollectionEvents.bulkPut(
        events.map(
          (item): OfflineAttendanceCollectionEventRecord => ({
            key: this.collectionEventKey(userId, item.eventId),
            userId,
            eventId: item.eventId,
            cachedAt,
            event: item.event,
          }),
        ),
      );
    });
  }

  async getCollectionEvents(userId: string): Promise<Array<{ eventId: string; event: PublicEvent }>> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return [];
    }

    const records = await database.attendanceCollectionEvents.where('userId').equals(userId).toArray();

    return records
      .map((record) => ({ eventId: record.eventId, event: record.event }))
      .sort((left, right) => Date.parse(left.event.startDate) - Date.parse(right.event.startDate));
  }

  async getCollectionEvent(userId: string, eventId: string): Promise<{ eventId: string; event: PublicEvent } | null> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return null;
    }

    const record = await database.attendanceCollectionEvents.get(this.collectionEventKey(userId, eventId));

    return record ? { eventId: record.eventId, event: record.event } : null;
  }

  async enqueue(item: OfflineAttendanceQueueItem): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      throw new Error('Armazenamento off-line indisponível neste navegador.');
    }

    await database.attendanceQueue.put(item);
  }

  watchEventItems(userId: string, eventId: string): Observable<OfflineAttendanceQueueItem[]> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return of([]);
    }

    return from(
      liveQuery(() =>
        database.attendanceQueue
          .where('[queuedByUserId+eventId]')
          .equals([userId, eventId])
          .filter((item) => item.status !== 'SYNCING')
          .toArray()
          .then((items) => this.sortNewestFirst(items)),
      ),
    );
  }

  watchUnresolvedItems(userId: string): Observable<OfflineAttendanceQueueItem[]> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return of([]);
    }

    return from(
      liveQuery(() =>
        database.attendanceQueue
          .where('queuedByUserId')
          .equals(userId)
          .filter((item) => item.status !== 'SYNCING')
          .toArray()
          .then((items) => this.sortNewestFirst(items)),
      ),
    );
  }

  async listPending(userId: string, limit = 80): Promise<OfflineAttendanceQueueItem[]> {
    await this.ensureStartupSyncingReset(userId);
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return [];
    }

    const items = await database.attendanceQueue
      .where('queuedByUserId')
      .equals(userId)
      .filter((item) => item.status === 'PENDING' || item.status === 'FAILED')
      .toArray();

    return this.sortOldestFirst(items).slice(0, limit);
  }

  async countPending(userId: string): Promise<number> {
    await this.ensureStartupSyncingReset(userId);
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return 0;
    }

    return database.attendanceQueue
      .where('queuedByUserId')
      .equals(userId)
      .filter((item) => item.status === 'PENDING' || item.status === 'FAILED')
      .count();
  }

  async countUnresolved(userId: string): Promise<number> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return 0;
    }

    return database.attendanceQueue
      .where('queuedByUserId')
      .equals(userId)
      .filter((item) => item.status !== 'SYNCING')
      .count();
  }

  async markSyncing(userId: string, clientIds: readonly string[]): Promise<void> {
    await this.updateStatus(userId, clientIds, 'SYNCING');
  }

  async resetSyncing(
    userId: string,
    clientIds?: readonly string[],
    message = 'Sincronização interrompida. Tente enviar novamente.',
  ): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    const now = Date.now();
    await database.transaction('rw', database.attendanceQueue, async () => {
      const items = clientIds?.length
        ? await database.attendanceQueue.bulkGet([...clientIds])
        : await database.attendanceQueue.where('[queuedByUserId+status]').equals([userId, 'SYNCING']).toArray();
      for (const item of items) {
        if (!item || item.queuedByUserId !== userId || item.status !== 'SYNCING') {
          continue;
        }

        await database.attendanceQueue.update(item.clientId, {
          status: 'FAILED',
          updatedAt: now,
          lastError: message,
        });
      }
    });
  }

  async recordSyncFailure(userId: string, clientIds: readonly string[], message: string): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database || clientIds.length === 0) {
      return;
    }

    const now = Date.now();
    await database.transaction('rw', database.attendanceQueue, async () => {
      for (const clientId of clientIds) {
        const item = await database.attendanceQueue.get(clientId);
        if (!item || item.queuedByUserId !== userId) {
          continue;
        }

        await database.attendanceQueue.update(clientId, {
          status: 'FAILED',
          attempts: item.attempts + 1,
          updatedAt: now,
          lastError: message,
        });
      }
    });
  }

  async applyCommitResults(userId: string, results: readonly OfflineAttendanceCommitResultLike[]): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    const now = Date.now();
    await database.transaction('rw', database.attendanceQueue, async () => {
      for (const result of results) {
        const item = await database.attendanceQueue.get(result.clientId);
        if (!item || item.queuedByUserId !== userId) {
          continue;
        }

        if (result.status === 'CREATED' || result.status === 'STAGED' || result.status === 'DUPLICATE') {
          await database.attendanceQueue.delete(result.clientId);
          continue;
        }

        const nextStatus = this.queueStatusForCommitStatus(result.status);
        await database.attendanceQueue.update(result.clientId, {
          status: nextStatus,
          attempts: item.attempts + 1,
          updatedAt: now,
          lastError: result.message ?? this.defaultStatusMessage(nextStatus),
        });
      }
    });
  }

  async remove(userId: string, clientId: string): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    const item = await database.attendanceQueue.get(clientId);
    if (item?.queuedByUserId === userId) {
      await database.attendanceQueue.delete(clientId);
    }
  }

  async retry(userId: string, clientId: string): Promise<void> {
    await this.updateStatus(userId, [clientId], 'PENDING', null);
  }

  private async updateStatus(
    userId: string,
    clientIds: readonly string[],
    status: OfflineAttendanceQueueStatus,
    lastError?: string | null,
  ): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database || clientIds.length === 0) {
      return;
    }

    const now = Date.now();
    await database.transaction('rw', database.attendanceQueue, async () => {
      for (const clientId of clientIds) {
        const item = await database.attendanceQueue.get(clientId);
        if (!item || item.queuedByUserId !== userId) {
          continue;
        }

        await database.attendanceQueue.update(clientId, {
          status,
          updatedAt: now,
          ...(lastError !== undefined ? { lastError } : {}),
        });
      }
    });
  }

  private queueStatusForCommitStatus(
    status: OfflineAttendanceCommitResultLike['status'],
  ): OfflineAttendanceQueueStatus {
    switch (status) {
      case 'DUPLICATE':
        return 'DUPLICATE';
      case 'CONFLICT':
        return 'CONFLICT';
      case 'FORBIDDEN':
        return 'FORBIDDEN';
      case 'FAILED':
      case 'CREATED':
      case 'STAGED':
        return 'FAILED';
    }
  }

  private defaultStatusMessage(status: OfflineAttendanceQueueStatus): string {
    switch (status) {
      case 'DUPLICATE':
        return 'Presença já registrada no servidor.';
      case 'CONFLICT':
        return 'Conflito encontrado. Revise antes de reenviar.';
      case 'FORBIDDEN':
        return 'Sem permissão para sincronizar esta presença.';
      case 'FAILED':
        return 'Não foi possível sincronizar.';
      case 'PENDING':
      case 'SYNCING':
        return 'Sincronização pendente.';
    }
  }

  private sortNewestFirst(items: OfflineAttendanceQueueItem[]): OfflineAttendanceQueueItem[] {
    return items.sort((left, right) => Date.parse(right.collectedAt) - Date.parse(left.collectedAt));
  }

  private sortOldestFirst(items: OfflineAttendanceQueueItem[]): OfflineAttendanceQueueItem[] {
    return items.sort((left, right) => left.queuedAt - right.queuedAt);
  }

  private collectionEventKey(userId: string, eventId: string): string {
    return `${userId}:${eventId}`;
  }

  private async ensureStartupSyncingReset(userId: string): Promise<void> {
    let reset = this.startupSyncingResetByUserId.get(userId);
    if (!reset) {
      reset = this.resetSyncing(userId);
      this.startupSyncingResetByUserId.set(userId, reset);
    }

    await reset;
  }
}
