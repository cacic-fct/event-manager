import { Service, inject } from '@angular/core';
import type { EventTargetType } from '@cacic-fct/event-manager-public-contracts';
import type { SubscriptionsFeed } from '@cacic-fct/shared-utils';
import { OfflineAttendanceDetail, OfflineUserSnapshot } from './public-data-schema';
import { PublicDatabaseProvider } from './public-database-provider';

@Service()
export class UserOfflineDataService {
  private readonly databaseProvider = inject(PublicDatabaseProvider);

  async replaceUserSnapshot(snapshot: OfflineUserSnapshot): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    await database.userSnapshots.put(snapshot);
  }

  async getLatestUserSnapshot(userId?: string): Promise<OfflineUserSnapshot | null> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return null;
    }

    if (userId) {
      return (await database.userSnapshots.get(userId)) ?? null;
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
      [
        database.userSnapshots,
        database.attendanceFeeds,
        database.attendanceDetails,
        database.totpSeeds,
        database.publicMapUserEventIds,
        database.myDaySnapshots,
      ],
      async () => {
        await database.userSnapshots.clear();
        await database.attendanceFeeds.clear();
        await database.attendanceDetails.clear();
        await database.totpSeeds.clear();
        await database.publicMapUserEventIds.clear();
        await database.myDaySnapshots.clear();
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
