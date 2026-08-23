import { Service, inject } from '@angular/core';
import {
  hasOfflineSportsAttendanceCollectorProof,
  type OfflineSportsCollectorCredential,
  type OfflineSportsOperationQueueItem,
  type OfflineSportsTimerSnapshot,
} from './public-data-schema';
import { PublicDatabaseProvider } from './public-database-provider';

@Service()
export class SportsOperationOfflineQueueService {
  private readonly databaseProvider = inject(PublicDatabaseProvider);

  async enqueue(item: OfflineSportsOperationQueueItem): Promise<boolean> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      throw new Error('Armazenamento off-line indisponível neste navegador.');
    }

    return database.transaction('rw', database.sportsOperationQueue, async () => {
      const key = this.key(item.userScope, item.id);
      if (await database.sportsOperationQueue.get(key)) {
        return false;
      }
      await database.sportsOperationQueue.add(item);
      return true;
    });
  }

  async list(userScope: string): Promise<OfflineSportsOperationQueueItem[]> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return [];
    }

    const items = await database.sportsOperationQueue.where('userScope').equals(userScope).toArray();
    return this.sort(items);
  }

  async listAll(): Promise<OfflineSportsOperationQueueItem[]> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return [];
    }

    return this.sort(await database.sportsOperationQueue.toArray());
  }

  async listUploadable(userScope: string): Promise<OfflineSportsOperationQueueItem[]> {
    return (await this.listAll()).filter((item) =>
      item.kind === 'ACTION' ? item.userScope === userScope : hasOfflineSportsAttendanceCollectorProof(item),
    );
  }

  async saveCollectorCredential(credential: OfflineSportsCollectorCredential): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      throw new Error('Armazenamento off-line indisponível neste navegador.');
    }
    await database.sportsCollectorCredentials.put(credential);
  }

  async getCollectorCredential(userScope: string, matchId: string): Promise<OfflineSportsCollectorCredential | null> {
    return (await this.databaseProvider.getDatabase()?.sportsCollectorCredentials.get([userScope, matchId])) ?? null;
  }

  async get(userScope: string, clientId: string): Promise<OfflineSportsOperationQueueItem | null> {
    return (await this.databaseProvider.getDatabase()?.sportsOperationQueue.get(this.key(userScope, clientId))) ?? null;
  }

  async attachTimerSnapshot(userScope: string, clientId: string, snapshot: OfflineSportsTimerSnapshot): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }
    const key = this.key(userScope, clientId);
    const item = await database.sportsOperationQueue.get(key);
    if (item?.kind === 'ACTION') {
      await database.sportsOperationQueue.put({ ...item, timerSnapshot: snapshot });
    }
  }

  async recordFailure(userScope: string, clientId: string, message: string): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }
    const key = this.key(userScope, clientId);
    const item = await database.sportsOperationQueue.get(key);
    if (item) {
      await database.sportsOperationQueue.update(key, {
        attempts: item.attempts + 1,
        lastError: message,
      });
    }
  }

  async remove(userScope: string, clientId: string): Promise<void> {
    await this.databaseProvider.getDatabase()?.sportsOperationQueue.delete(this.key(userScope, clientId));
  }

  async resolveTimerConflict(
    userScope: string,
    matchId: string,
    discardedClientIds: readonly string[],
    baseRevision: number,
  ): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }
    const discarded = new Set(discardedClientIds);
    await database.transaction('rw', database.sportsOperationQueue, async () => {
      const items = (await database.sportsOperationQueue.where('userScope').equals(userScope).toArray()).sort(
        (left, right) => left.queuedAt.localeCompare(right.queuedAt) || left.id.localeCompare(right.id),
      );
      let nextRevision = baseRevision;
      for (const item of items) {
        if (item.kind !== 'ACTION' || item.action.matchId !== matchId) {
          continue;
        }
        const key = this.key(userScope, item.id);
        if (discarded.has(item.id)) {
          await database.sportsOperationQueue.delete(key);
          continue;
        }
        await database.sportsOperationQueue.put({
          ...item,
          action: { ...item.action, baseRevision: nextRevision },
        });
        nextRevision += 1;
      }
    });
  }

  private key(userScope: string, clientId: string): [string, string] {
    return [userScope, clientId];
  }

  private sort(items: OfflineSportsOperationQueueItem[]): OfflineSportsOperationQueueItem[] {
    return items.sort((left, right) => left.queuedAt.localeCompare(right.queuedAt) || left.id.localeCompare(right.id));
  }
}
