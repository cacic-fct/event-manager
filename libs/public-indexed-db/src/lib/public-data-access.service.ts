import { Service, inject } from '@angular/core';
import type { EventTargetType, PublicEvent, PublicMapEvent } from '@cacic-fct/event-manager-public-contracts';
import type { SubscriptionsFeed } from '@cacic-fct/shared-utils';
import { CalendarDataCacheService } from './calendar-data-cache.service';
import { OfflineAttendanceDetail, OfflineRestaurantCard, OfflineUserSnapshot } from './public-data-schema';
import { UserOfflineDataService } from './user-offline-data.service';
import { PublicMapDataCacheService } from './public-map-data-cache.service';

@Service()
export class PublicDataAccessService {
  private readonly calendarData = inject(CalendarDataCacheService);
  private readonly userData = inject(UserOfflineDataService);
  private readonly publicMapData = inject(PublicMapDataCacheService);

  async getCalendarEvents(startDateFrom: string): Promise<PublicEvent[]> {
    return this.calendarData.getEvents(startDateFrom);
  }

  async upsertCalendarEvents(events: PublicEvent[]): Promise<void> {
    await this.calendarData.upsertEvents(events);
  }

  async getLastRefresh(datasetKey: string): Promise<number | null> {
    return this.calendarData.getLastRefresh(datasetKey);
  }

  async replacePublicMapEvents(events: readonly PublicMapEvent[]): Promise<void> {
    await this.publicMapData.replaceEvents(events);
  }

  async getPublicMapEvents(maxAgeMs: number): Promise<PublicMapEvent[] | null> {
    const mapEvents = await this.publicMapData.getEvents(maxAgeMs);
    if (mapEvents !== null) {
      return mapEvents;
    }

    const minimumDate = new Date();
    minimumDate.setMonth(minimumDate.getMonth() - 1);
    const lastCalendarRefresh = await this.calendarData.getLastRefresh('calendarEvents');
    if (lastCalendarRefresh === null || Date.now() - lastCalendarRefresh > maxAgeMs) {
      return null;
    }
    const calendarEvents = await this.calendarData.getEvents(minimumDate.toISOString());
    return calendarEvents
      .filter(
        (event): event is PublicEvent & { latitude: number; longitude: number } =>
          event.latitude != null && event.longitude != null && new Date(event.endDate).getTime() >= Date.now(),
      )
      .map(({ id, name, startDate, endDate, emoji, latitude, longitude, locationDescription }) => ({
        id,
        name,
        startDate,
        endDate,
        emoji,
        latitude,
        longitude,
        locationDescription,
      }));
  }

  async replacePublicMapUserEventIds(userId: string, eventIds: readonly string[]): Promise<void> {
    await this.publicMapData.replaceUserEventIds(userId, eventIds);
  }

  async getPublicMapUserEventIds(userId: string, maxAgeMs: number): Promise<string[] | null> {
    return this.publicMapData.getUserEventIds(userId, maxAgeMs);
  }

  async replaceUserSnapshot(snapshot: OfflineUserSnapshot): Promise<void> {
    await this.userData.replaceUserSnapshot(snapshot);
  }

  async getLatestUserSnapshot(): Promise<OfflineUserSnapshot | null> {
    return this.userData.getLatestUserSnapshot();
  }

  async replaceRestaurantCard(card: OfflineRestaurantCard): Promise<void> {
    await this.userData.replaceRestaurantCard(card);
  }

  async getRestaurantCard(userId: string): Promise<OfflineRestaurantCard | null> {
    return this.userData.getRestaurantCard(userId);
  }

  async replaceAttendanceFeed(userId: string, feed: SubscriptionsFeed): Promise<void> {
    await this.userData.replaceAttendanceFeed(userId, feed);
  }

  async getAttendanceFeed(userId: string): Promise<SubscriptionsFeed | null> {
    return this.userData.getAttendanceFeed(userId);
  }

  async replaceAttendanceDetail(userId: string, targetId: string, detail: OfflineAttendanceDetail): Promise<void> {
    await this.userData.replaceAttendanceDetail(userId, targetId, detail);
  }

  async getAttendanceDetail(
    userId: string,
    targetType: EventTargetType,
    targetId: string,
  ): Promise<OfflineAttendanceDetail | null> {
    return this.userData.getAttendanceDetail(userId, targetType, targetId);
  }

  async purgeUserData(): Promise<void> {
    await this.userData.purgeUserData();
  }
}
