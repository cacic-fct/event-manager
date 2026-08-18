import { Injectable, inject } from '@angular/core';
import type { CurrentUserMyDay } from '@cacic-fct/event-manager-public-contracts';
import { PublicDatabaseProvider } from './public-database-provider';

@Injectable({ providedIn: 'root' })
export class MyDayCacheService {
  private readonly databaseProvider = inject(PublicDatabaseProvider);

  async put(userId: string, data: CurrentUserMyDay): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }
    await database.myDaySnapshots.put({
      key: this.key(userId, data.selectedDate),
      userId,
      date: data.selectedDate,
      updatedAt: Date.now(),
      data,
    });
  }

  async get(userId: string, date: string): Promise<CurrentUserMyDay | null> {
    const record = await this.databaseProvider.getDatabase()?.myDaySnapshots.get(this.key(userId, date));
    return record?.data ?? null;
  }

  async clearForUser(userId: string): Promise<void> {
    await this.databaseProvider.getDatabase()?.myDaySnapshots.where('userId').equals(userId).delete();
  }

  private key(userId: string, date: string): string {
    return `${userId}:${date}`;
  }
}
