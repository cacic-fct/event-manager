import { Injectable, inject } from '@angular/core';
import type { EventTargetType, PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import type { SubscriptionsFeed } from '@cacic-fct/shared-utils';
import { CalendarDataCacheService } from './calendar-data-cache.service';
import { OfflineAttendanceDetail, OfflineRestaurantCard, OfflineUserSnapshot } from './public-data-schema';
import { UserOfflineDataService } from './user-offline-data.service';

@Injectable({ providedIn: 'root' })
export class PublicDataAccessService {
  private readonly calendarData = inject(CalendarDataCacheService);
  private readonly userData = inject(UserOfflineDataService);

  async getCalendarEvents(startDateFrom: string): Promise<PublicEvent[]> {
    return this.calendarData.getEvents(startDateFrom);
  }

  async upsertCalendarEvents(events: PublicEvent[]): Promise<void> {
    await this.calendarData.upsertEvents(events);
  }

  async getLastRefresh(datasetKey: string): Promise<number | null> {
    return this.calendarData.getLastRefresh(datasetKey);
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
