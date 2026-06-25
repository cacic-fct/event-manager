import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AttendanceOfflineQueueService,
  OfflineAttendanceQueueItem,
} from '@cacic-fct/offline-public-data-access';
import { AuthService } from '@cacic-fct/shared-angular';
import { firstValueFrom } from 'rxjs';
import { NetworkStatusService } from '../../shared/network-status.service';
import {
  AttendanceCollectionApiService,
  OfflineAttendanceCommitResult,
  OfflineAttendanceCommitPayload,
} from './attendance-collection-api.service';
import { AttendanceIncognitoWarningService } from './attendance-incognito-warning.service';
import { AttendanceOfflineSyncResultDialog } from './attendance-offline-sync-result.dialog';
import { AttendanceScannerCacheService } from './attendance-scanner-cache.service';

const HOURLY_REMINDER_MS = 60 * 60_000;
const MAX_SYNC_ATTEMPTS = 3;
const INITIAL_SYNC_RETRY_DELAY_MS = 1000;
const MAX_SYNC_RETRY_DELAY_MS = 8000;

@Injectable({ providedIn: 'root' })
export class AttendanceOfflineSyncService {
  private readonly api = inject(AttendanceCollectionApiService);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(AttendanceScannerCacheService);
  private readonly dialog = inject(MatDialog);
  private readonly incognitoWarning = inject(AttendanceIncognitoWarningService);
  private readonly network = inject(NetworkStatusService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly queue = inject(AttendanceOfflineQueueService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private initializedUserId: string | null = null;
  private initializationRunning = false;
  private syncRunning = false;
  private reminderTimer: ReturnType<typeof setInterval> | null = null;
  private lastReminderAt = 0;

  start(): void {
    if (!this.isBrowser) {
      return;
    }

    effect(() => {
      const user = this.auth.user();
      const isOnline = this.network.isOnline();
      if (!user?.sub || !isOnline) {
        return;
      }

      void this.initializeForUser(user.sub);
      void this.syncPending();
    });

    this.reminderTimer ??= setInterval(() => void this.remindPending(), HOURLY_REMINDER_MS);
    void this.remindPending();
  }

  async syncPending(): Promise<void> {
    if (!this.isBrowser || this.syncRunning || !this.network.isOnline()) {
      return;
    }

    const items = await this.queue.listPending();
    if (items.length === 0) {
      return;
    }

    this.syncRunning = true;
    try {
      await this.syncWithRetries(items);
    } finally {
      this.syncRunning = false;
    }
  }

  async notifyPendingNow(): Promise<void> {
    await this.remindPending(true);
  }

  private async initializeForUser(userId: string): Promise<void> {
    if (this.initializationRunning || this.initializedUserId === userId) {
      return;
    }

    this.initializationRunning = true;
    try {
      const events = await firstValueFrom(this.api.listCollectionEvents());
      await this.queue.replaceCollectionEvents(userId, events);
      if (events.length === 0) {
        this.initializedUserId = userId;
        return;
      }

      await Promise.allSettled([
        this.cache.cacheAttendanceCollection(events),
        this.incognitoWarning.warnIfPrivateBrowsing(),
      ]);
      this.initializedUserId = userId;
    } catch {
      return;
    } finally {
      this.initializationRunning = false;
    }
  }

  private toPayload(item: OfflineAttendanceQueueItem): OfflineAttendanceCommitPayload {
    return {
      clientId: item.clientId,
      eventId: item.eventId,
      createdByMethod: item.createdByMethod,
      code: item.code,
      value: item.value,
      location: item.location,
      collectedAt: item.collectedAt,
      authorUserId: item.authorUserId,
      authorName: item.authorName,
      authorEmail: item.authorEmail,
    };
  }

  private async syncWithRetries(items: readonly OfflineAttendanceQueueItem[]): Promise<void> {
    let remaining = [...items];
    const successfulResults: OfflineAttendanceCommitResult[] = [];
    const finalFailures = new Map<string, { item: OfflineAttendanceQueueItem; message: string }>();

    for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS && remaining.length > 0; attempt++) {
      const clientIds = remaining.map((item) => item.clientId);
      await this.queue.markSyncing(clientIds);

      try {
        const results = await firstValueFrom(
          this.api.commitOfflineAttendances(remaining.map((item) => this.toPayload(item))),
        );
        await this.queue.applyCommitResults(results);
        successfulResults.push(...results.filter((result) => this.isDurableResult(result)));

        const resultByClientId = new Map(results.map((result) => [result.clientId, result]));
        const missingAcknowledgements = remaining.filter((item) => !resultByClientId.has(item.clientId));
        if (missingAcknowledgements.length > 0) {
          await this.queue.recordSyncFailure(
            missingAcknowledgements.map((item) => item.clientId),
            'O servidor não confirmou o recebimento desta presença.',
          );
        }

        const retryableFailureByClientId = new Map(
          results
            .filter((result) => this.isRetryableResult(result))
            .map((result) => [result.clientId, result.message ?? 'Falha de sincronização.']),
        );
        const terminalFailureByClientId = new Map(
          results
            .filter((result) => !this.isDurableResult(result) && !this.isRetryableResult(result))
            .map((result) => [result.clientId, result.message ?? 'Falha de sincronização.']),
        );
        for (const item of missingAcknowledgements) {
          retryableFailureByClientId.set(item.clientId, 'O servidor não confirmou o recebimento desta presença.');
        }

        for (const item of remaining) {
          const message = terminalFailureByClientId.get(item.clientId);
          if (message) {
            finalFailures.set(item.clientId, {
              item,
              message,
            });
          }
        }

        remaining = remaining.filter((item) => retryableFailureByClientId.has(item.clientId));

        for (const item of remaining) {
          finalFailures.set(item.clientId, {
            item,
            message: retryableFailureByClientId.get(item.clientId) ?? 'Falha de sincronização.',
          });
        }

        if (attempt < MAX_SYNC_ATTEMPTS && remaining.length > 0) {
          remaining.forEach((item) => finalFailures.delete(item.clientId));
          await this.waitBeforeRetry(attempt);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Falha de sincronização.';
        await this.queue.recordSyncFailure(clientIds, message);
        remaining.forEach((item) =>
          finalFailures.set(item.clientId, {
            item,
            message,
          }),
        );
        if (attempt < MAX_SYNC_ATTEMPTS && remaining.length > 0) {
          remaining.forEach((item) => finalFailures.delete(item.clientId));
          await this.waitBeforeRetry(attempt);
        }
      }
    }

    this.showSyncResultDialog(successfulResults, [...finalFailures.values()]);
  }

  private isDurableResult(result: OfflineAttendanceCommitResult): boolean {
    return result.status === 'CREATED' || result.status === 'STAGED' || result.status === 'DUPLICATE';
  }

  private isRetryableResult(result: OfflineAttendanceCommitResult): boolean {
    return result.status === 'FAILED';
  }

  private waitBeforeRetry(attempt: number): Promise<void> {
    const delayMs = Math.min(MAX_SYNC_RETRY_DELAY_MS, INITIAL_SYNC_RETRY_DELAY_MS * 2 ** (attempt - 1));
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private showSyncResultDialog(
    successfulResults: readonly OfflineAttendanceCommitResult[],
    failedItems: ReadonlyArray<{ item: OfflineAttendanceQueueItem; message: string }>,
  ): void {
    const createdCount = successfulResults.filter((result) => result.status === 'CREATED').length;
    const stagedCount = successfulResults.filter((result) => result.status === 'STAGED').length;
    if (createdCount === 0 && stagedCount === 0 && failedItems.length === 0) {
      return;
    }

    this.dialog.open(AttendanceOfflineSyncResultDialog, {
      width: 'min(32rem, 94vw)',
      data: {
        createdCount,
        stagedCount,
        failedItems: failedItems.map(({ item, message }) => ({
          eventName: item.eventName,
          message,
        })),
      },
    });
  }

  private async remindPending(force = false): Promise<void> {
    const count = await this.queue.countPending();
    if (count === 0) {
      return;
    }

    const now = Date.now();
    if (!force && now - this.lastReminderAt < HOURLY_REMINDER_MS) {
      return;
    }

    this.lastReminderAt = now;
    const message = `${count} presença(s) aguardando envio. Sincronize quando houver conexão.`;
    if (await this.showServiceWorkerNotification(message)) {
      return;
    }

    this.snackbar.open(message, 'Sincronizar', { duration: 8000 }).onAction().subscribe(() => {
      void this.syncPending();
    });
  }

  private async showServiceWorkerNotification(message: string): Promise<boolean> {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Presenças off-line pendentes', {
      body: message,
      tag: 'offline-attendance-reminder',
      data: {
        url: new URL('attendance/collect', document.baseURI).toString(),
      },
    });
    return true;
  }
}
