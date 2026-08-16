import { Injectable, inject } from '@angular/core';
import type { PublicMapEvent } from '@cacic-fct/event-manager-public-contracts';
import type { SubscriptionsFeed } from '@cacic-fct/shared-utils';
import { CachedPublicMapEvent } from './public-data-schema';
import { PublicDatabaseProvider } from './public-database-provider';

const PUBLIC_MAP_EVENTS_METADATA_KEY = 'publicMapEvents';

@Injectable({ providedIn: 'root' })
export class PublicMapDataCacheService {
  private readonly databaseProvider = inject(PublicDatabaseProvider);

  async replaceEvents(events: readonly PublicMapEvent[]): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    const cachedAt = Date.now();
    const entries = events.map(
      (event): CachedPublicMapEvent => ({ id: event.id, endDate: event.endDate, cachedAt, event }),
    );

    await database.transaction('rw', database.publicMapEvents, database.syncMetadata, async () => {
      await database.publicMapEvents.clear();
      if (entries.length > 0) {
        await database.publicMapEvents.bulkPut(entries);
      }
      await database.syncMetadata.put({ key: PUBLIC_MAP_EVENTS_METADATA_KEY, refreshedAt: cachedAt });
    });
  }

  async getEvents(maxAgeMs: number): Promise<PublicMapEvent[] | null> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return null;
    }

    const metadata = await database.syncMetadata.get(PUBLIC_MAP_EVENTS_METADATA_KEY);
    if (!metadata || Date.now() - metadata.refreshedAt > maxAgeMs) {
      return null;
    }

    const events = await database.publicMapEvents.toArray();
    return events
      .map(({ event }) => event)
      .filter(({ endDate }) => new Date(endDate).getTime() >= Date.now())
      .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id));
  }

  async replaceUserEventIds(userId: string, eventIds: readonly string[]): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    await database.publicMapUserEventIds.put({ userId, updatedAt: Date.now(), eventIds: [...eventIds] });
  }

  async getUserEventIds(userId: string, maxAgeMs: number): Promise<string[] | null> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return null;
    }

    const record = await database.publicMapUserEventIds.get(userId);
    if (record && Date.now() - record.updatedAt <= maxAgeMs) {
      return record.eventIds;
    }

    const feed = await database.attendanceFeeds.get(`${userId}:feed`);
    return feed && Date.now() - feed.updatedAt <= maxAgeMs ? this.eventIdsFromSubscriptionsFeed(feed.feed) : null;
  }

  private eventIdsFromSubscriptionsFeed(feed: SubscriptionsFeed): string[] {
    const eventIds = new Set(feed.attendances.map(({ eventId }) => eventId));

    for (const item of feed.eventItems) {
      if (item.__typename === 'SubscribedSingleEventItem') {
        eventIds.add(item.event.id);
      } else {
        item.events.forEach(({ id }) => eventIds.add(id));
      }
    }

    for (const item of feed.majorEventItems) {
      item.selectedEvents?.forEach(({ id }) => eventIds.add(id));
      item.notSubscribedEvents?.forEach(({ id }) => eventIds.add(id));
    }

    return [...eventIds];
  }
}
