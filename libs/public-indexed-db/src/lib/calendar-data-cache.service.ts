import { Injectable, inject } from '@angular/core';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { compareIsoDateAsc } from '@cacic-fct/shared-utils';
import { subMonths } from 'date-fns';
import { CachedCalendarEvent } from './public-data-schema';
import { PublicDatabaseProvider } from './public-database-provider';

@Injectable({ providedIn: 'root' })
export class CalendarDataCacheService {
  private readonly databaseProvider = inject(PublicDatabaseProvider);

  async getEvents(startDateFrom: string): Promise<PublicEvent[]> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return [];
    }

    await this.expireEvents(this.expirationThreshold());

    const events = await database.calendarEvents.where('startDate').aboveOrEqual(startDateFrom).toArray();

    return events.map((entry) => entry.event).sort((left, right) => compareIsoDateAsc(left.startDate, right.startDate));
  }

  async upsertEvents(events: PublicEvent[]): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    const cachedAt = Date.now();
    const minimumStartDate = this.expirationThreshold();
    const entries = events.map(
      (event): CachedCalendarEvent => ({
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
    return subMonths(new Date(), 1).toISOString();
  }
}
