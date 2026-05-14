import { Injectable, inject } from '@angular/core';
import type { EventTargetType, PublicEvent, SubscriptionsFeed } from '@cacic-fct/shared-utils';
import { CalendarOfflineDataService } from './calendar-offline-data.service';
import { OfflineAttendanceDetail, OfflineUserSnapshot } from './offline-public-data-schema';
import { UserOfflineDataService } from './user-offline-data.service';

@Injectable({ providedIn: 'root' })
export class OfflinePublicDataAccessService {
  private readonly calendarData = inject(CalendarOfflineDataService);
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
