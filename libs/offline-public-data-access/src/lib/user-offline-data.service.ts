import { Injectable, inject } from '@angular/core';
import type { EventTargetType, SubscriptionsFeed } from '@cacic-fct/shared-utils';
import { OfflineAttendanceDetail, OfflineUserSnapshot } from './offline-public-data-schema';
import { OfflinePublicDatabaseProvider } from './offline-public-database-provider';

@Injectable({ providedIn: 'root' })
export class UserOfflineDataService {
  private readonly databaseProvider = inject(OfflinePublicDatabaseProvider);

  async replaceUserSnapshot(snapshot: OfflineUserSnapshot): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    await database.userSnapshots.put(snapshot);
  }

  async getLatestUserSnapshot(): Promise<OfflineUserSnapshot | null> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return null;
    }

    return (await database.userSnapshots.orderBy('updatedAt').last()) ?? null;
  }

  async replaceAttendanceFeed(userId: string, feed: SubscriptionsFeed): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    await database.attendanceFeeds.put({
      key: this.attendanceFeedKey(userId),
      userId,
      updatedAt: Date.now(),
      feed,
    });
  }

  async getAttendanceFeed(userId: string): Promise<SubscriptionsFeed | null> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return null;
    }

    const record = await database.attendanceFeeds.get(this.attendanceFeedKey(userId));

    return record?.feed ?? null;
  }

  async replaceAttendanceDetail(userId: string, targetId: string, detail: OfflineAttendanceDetail): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    await database.attendanceDetails.put({
      key: this.attendanceDetailKey(userId, detail.eventType, targetId),
      userId,
      targetType: detail.eventType,
      targetId,
      updatedAt: Date.now(),
      detail,
    });
  }

  async getAttendanceDetail(
    userId: string,
    targetType: EventTargetType,
    targetId: string,
  ): Promise<OfflineAttendanceDetail | null> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return null;
    }

    const record = await database.attendanceDetails.get(this.attendanceDetailKey(userId, targetType, targetId));

    return record?.detail ?? null;
  }

  async purgeUserData(): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    await database.transaction(
      'rw',
      database.userSnapshots,
      database.attendanceFeeds,
      database.attendanceDetails,
      async () => {
        await database.userSnapshots.clear();
        await database.attendanceFeeds.clear();
        await database.attendanceDetails.clear();
      },
    );
  }

  private attendanceFeedKey(userId: string): string {
    return `${userId}:feed`;
  }

  private attendanceDetailKey(userId: string, targetType: EventTargetType, targetId: string): string {
    return `${userId}:${targetType}:${targetId}`;
  }
}
