import { Injectable, inject } from '@angular/core';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { OfflineCalendarEvent } from './offline-public-data-schema';
import { OfflinePublicDatabaseProvider } from './offline-public-database-provider';

@Injectable({ providedIn: 'root' })
export class CalendarOfflineDataService {
  private readonly databaseProvider = inject(OfflinePublicDatabaseProvider);

  async getEvents(startDateFrom: string): Promise<PublicEvent[]> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return [];
    }

    await this.expireEvents(this.expirationThreshold());

    const events = await database.calendarEvents.where('startDate').aboveOrEqual(startDateFrom).toArray();

    return events.map((entry) => entry.event).sort((left, right) => Date.parse(left.startDate) - Date.parse(right.startDate));
  }

  async upsertEvents(events: PublicEvent[]): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    const cachedAt = Date.now();
    const minimumStartDate = this.expirationThreshold();
    const entries = events.map(
      (event): OfflineCalendarEvent => ({
        id: event.id,
        startDate: event.startDate,
        cachedAt,
        event,
      }),
    );

    await database.transaction('rw', database.calendarEvents, database.syncMetadata, async () => {
      if (entries.length > 0) {
        await database.calendarEvents.bulkPut(entries);
      }

      await this.expireEvents(minimumStartDate);
      await database.syncMetadata.put({
        key: 'calendarEvents',
        refreshedAt: cachedAt,
      });
    });
  }

  async getLastRefresh(datasetKey: string): Promise<number | null> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return null;
    }

    const metadata = await database.syncMetadata.get(datasetKey);

    return metadata?.refreshedAt ?? null;
  }

  private async expireEvents(minimumStartDate: string): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    await database.calendarEvents.where('startDate').below(minimumStartDate).delete();
  }

  private expirationThreshold(): string {
    const threshold = new Date();
    threshold.setMonth(threshold.getMonth() - 1);

    return threshold.toISOString();
  }
}
