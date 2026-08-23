import { isPlatformBrowser } from '@angular/common';
import { Service, PLATFORM_ID, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AttendanceOfflineQueueService,
  OfflineAttendanceQueueItem,
  OralAttendanceOfflineService,
} from '@cacic-fct/public-indexed-db';
import { AuthService } from '@cacic-fct/shared-angular';
import { firstValueFrom } from 'rxjs';
import { NetworkStatusService } from '../../../shared/network-status.service';
import {
  AttendanceCollectionApiService,
  OfflineAttendanceCommitResult,
  OfflineAttendanceCommitPayload,
} from '../attendance-collection-api.service';
import { AttendanceIncognitoWarningService } from '../incognito-warning/attendance-incognito-warning.service';
import { AttendanceOfflineSyncResultDialog } from './result-dialog';
import { AttendanceScannerCacheService } from '../scanner/cache.service';

const HOURLY_REMINDER_MS = 60 * 60_000;
const MAX_SYNC_ATTEMPTS = 3;
const INITIAL_SYNC_RETRY_DELAY_MS = 1000;
const MAX_SYNC_RETRY_DELAY_MS = 8000;

@Service()
export class AttendanceOfflineSyncService {
  private readonly api = inject(AttendanceCollectionApiService);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(AttendanceScannerCacheService);
  private readonly dialog = inject(MatDialog);
  private readonly incognitoWarning = inject(AttendanceIncognitoWarningService);
  private readonly network = inject(NetworkStatusService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly queue = inject(AttendanceOfflineQueueService);
  private readonly oralQueue = inject(OralAttendanceOfflineService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private initializedUserId: string | null = null;
  private initializationPromise: Promise<void> | null = null;
  private attendanceSyncPromise: Promise<void> | null = null;
  private oralSyncPromise: Promise<void> | null = null;
  private authGeneration = 0;
  private activeUserId: string | null = null;
  private reminderTimer: ReturnType<typeof setInterval> | null = null;
  private lastReminderAt = 0;

  start(): void {
    if (!this.isBrowser) {
      return;
    }

    effect(() => {
      const user = this.auth.user();
      const isOnline = this.network.isOnline();
      const userId = user?.sub ?? null;
      if (this.activeUserId !== userId) {
        this.initializedUserId = null;
      }
      this.activeUserId = userId;
      const generation = ++this.authGeneration;
      if (!user?.sub || !isOnline) {
        return;
      }

      void this.initializeForUser(user.sub, generation).catch(() => undefined);
      void this.syncPending(user.sub, generation).catch(() => undefined);
    });

    this.reminderTimer ??= setInterval(() => void this.remindPending().catch(() => undefined), HOURLY_REMINDER_MS);
    void this.remindPending().catch(() => undefined);
  }

  async syncPending(expectedUserId?: string, expectedGeneration?: number): Promise<void> {
    if (!this.isBrowser || !this.network.isOnline()) {
      return;
    }

    const userId = expectedUserId ?? this.auth.user()?.sub;
    if (!userId) {
      return;
    }

    if (this.authGeneration === 0) {
      this.authGeneration = 1;
      this.activeUserId = userId;
    }
    const generation = expectedGeneration ?? this.authGeneration;
    if (!this.isCurrentRun(userId, generation)) {
      return;
    }

    try {
      await Promise.all([this.syncAttendanceQueue(userId, generation), this.syncOralQueue(userId, generation)]);
    } catch {
      // IndexedDB/network failures are surfaced on the next online/manual
      // attempt; callers commonly invoke this method from fire-and-forget
      // reactive effects, so never leak an unhandled rejection.
    }
  }

  private syncAttendanceQueue(userId: string, generation: number): Promise<void> {
    if (this.attendanceSyncPromise) {
      return this.attendanceSyncPromise;
    }

    const run = this.runAttendanceQueue(userId, generation);
    this.attendanceSyncPromise = run.finally(() => {
      this.attendanceSyncPromise = null;
      this.rerunForLatestUser(userId, generation);
    });
    return this.attendanceSyncPromise;
  }

  private async runAttendanceQueue(userId: string, generation: number): Promise<void> {
    const items = await this.queue.listUploadable(userId);
    if (items.length === 0) {
      return;
    }

    await this.syncWithRetries(userId, items, generation);
  }

  private syncOralQueue(userId: string, generation: number): Promise<void> {
    if (this.oralSyncPromise) {
      return this.oralSyncPromise;
    }

    const run = this.runOralQueue(userId, generation);
    this.oralSyncPromise = run.finally(() => {
      this.oralSyncPromise = null;
      this.rerunForLatestUser(userId, generation);
    });
    return this.oralSyncPromise;
  }

  private async runOralQueue(userId: string, generation: number): Promise<void> {
    const items = await this.oralQueue.listUploadable(userId);
    if (items.length === 0) {
      return;
    }

    let failedCount = 0;
    const itemsByEvent = new Map<string, typeof items>();
      for (const item of items) {
        const eventItems = itemsByEvent.get(item.eventId) ?? [];
        eventItems.push(item);
        itemsByEvent.set(item.eventId, eventItems);
      }

      for (const eventItems of itemsByEvent.values()) {
        for (let offset = 0; offset < eventItems.length; offset += 1000) {
          const batch = eventItems.slice(offset, offset + 1000);
          let lastError: unknown;
          let synced = false;
          for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS; attempt++) {
            try {
              await firstValueFrom(
                this.api.registerOralBatch(
                  batch.map((item) => ({
                    clientId: item.clientId,
                    eventId: item.eventId,
                    personId: item.personId,
                    status: item.status,
                    collectedAt: item.collectedAt,
                    collectedByUserId: item.queuedByUserId,
                    location: item.location,
                    collectorCredential: item.collectorCredential,
                  })),
                ),
              );
              await this.oralQueue.markSynced(batch.map((item) => item.clientId));
              synced = true;
              break;
            } catch (error: unknown) {
              lastError = error;
              if (attempt < MAX_SYNC_ATTEMPTS) {
                await this.waitBeforeRetry(attempt);
              }
            }
          }

          if (!synced) {
            failedCount += batch.length;
            const message = lastError instanceof Error ? lastError.message : 'Falha de sincronização.';
            await this.oralQueue.recordFailure(
              batch.map((item) => item.clientId),
              message,
            );
          }
        }
    }

    if (failedCount > 0 && this.isCurrentRun(userId, generation)) {
      this.snackbar.open(
        `${failedCount} decisão(ões) da chamada oral continuam salvas e serão tentadas novamente.`,
        'Fechar',
        { duration: 6000 },
      );
    }
  }

  async notifyPendingNow(): Promise<void> {
    await this.remindPending(true);
  }

  private initializeForUser(userId: string, generation: number): Promise<void> {
    if (this.initializedUserId === userId) {
      return Promise.resolve();
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    const run = this.runInitialization(userId, generation);
    this.initializationPromise = run.finally(() => {
      this.initializationPromise = null;
      if (this.activeUserId && (this.activeUserId !== userId || this.authGeneration !== generation)) {
        void this.initializeForUser(this.activeUserId, this.authGeneration).catch(() => undefined);
      }
    });
    return this.initializationPromise;
  }

  private async runInitialization(userId: string, generation: number): Promise<void> {
    if (!this.isCurrentRun(userId, generation)) {
      return;
    }

    try {
      const events = await firstValueFrom(this.api.listCollectionEvents());
      if (!this.isCurrentRun(userId, generation)) {
        return;
      }
      await this.queue.replaceCollectionEvents(userId, events);
      if (events.length === 0) {
        this.initializedUserId = userId;
        return;
      }

      await Promise.allSettled([
        this.cache.cacheAttendanceCollection(events),
        this.incognitoWarning.warnIfPrivateBrowsing(),
      ]);
      if (this.isCurrentRun(userId, generation)) {
        this.initializedUserId = userId;
      }
    } catch {
      return;
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
      collectorCredential: item.collectorCredential,
    };
  }

  private async syncWithRetries(
    userId: string,
    items: readonly OfflineAttendanceQueueItem[],
    generation: number,
  ): Promise<void> {
    let remaining = [...items];
    const successfulResults: OfflineAttendanceCommitResult[] = [];
    const finalFailures = new Map<string, { item: OfflineAttendanceQueueItem; message: string }>();

    for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS && remaining.length > 0; attempt++) {
      await this.forEachAttendanceOwner(remaining, (ownerUserId, ownerClientIds) =>
        this.queue.markSyncing(ownerUserId, ownerClientIds),
      );

      try {
        const results = await firstValueFrom(
          this.api.commitOfflineAttendances(remaining.map((item) => this.toPayload(item))),
        );
        const attemptedByClientId = new Map(remaining.map((item) => [item.clientId, item]));
        await this.forEachAttendanceOwner(
          results.flatMap((result) => {
            const item = attemptedByClientId.get(result.clientId);
            return item ? [item] : [];
          }),
          (ownerUserId, ownerClientIds) =>
            this.queue.applyCommitResults(
              ownerUserId,
              results.filter((result) => ownerClientIds.includes(result.clientId)),
            ),
        );
        successfulResults.push(...results.filter((result) => this.isDurableResult(result)));

        const resultByClientId = new Map(results.map((result) => [result.clientId, result]));
        const missingAcknowledgements = remaining.filter((item) => !resultByClientId.has(item.clientId));
        if (missingAcknowledgements.length > 0) {
          await this.forEachAttendanceOwner(
            missingAcknowledgements,
            (ownerUserId, ownerClientIds) =>
              this.queue.recordSyncFailure(
                ownerUserId,
                ownerClientIds,
                'O servidor não confirmou o recebimento desta presença.',
              ),
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
        await this.forEachAttendanceOwner(remaining, (ownerUserId, ownerClientIds) =>
          this.queue.recordSyncFailure(ownerUserId, ownerClientIds, message),
        );
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

    if (this.isCurrentRun(userId, generation)) {
      this.showSyncResultDialog(successfulResults, [...finalFailures.values()]);
    }
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
    const userId = this.auth.user()?.sub;
    if (!userId) {
      return;
    }

    const count = await this.queue.countUploadable(userId);
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

    this.snackbar
      .open(message, 'Sincronizar', { duration: 8000 })
      .onAction()
      .subscribe(() => {
        void this.syncPending().catch(() => undefined);
      });
  }

  private async showServiceWorkerNotification(message: string): Promise<boolean> {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) {
      return false;
    }

    try {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Service Worker indisponível.')), 2_000);
        }),
      ]);
      await registration.showNotification('Presenças off-line pendentes', {
        body: message,
        tag: 'offline-attendance-reminder',
        data: {
          url: new URL('attendance/collect', document.baseURI).toString(),
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  private isCurrentRun(userId: string, generation: number): boolean {
    return this.activeUserId === userId && this.authGeneration === generation && this.auth.user()?.sub === userId;
  }

  private rerunForLatestUser(userId: string, generation: number): void {
    if (this.activeUserId !== userId || this.authGeneration === generation) {
      return;
    }

    void this.syncPending(this.activeUserId ?? undefined, this.authGeneration).catch(() => undefined);
  }

  private async forEachAttendanceOwner(
    items: readonly OfflineAttendanceQueueItem[],
    operation: (ownerUserId: string, clientIds: string[]) => Promise<unknown>,
  ): Promise<void> {
    const clientIdsByOwner = new Map<string, string[]>();
    for (const item of items) {
      const clientIds = clientIdsByOwner.get(item.queuedByUserId) ?? [];
      clientIds.push(item.clientId);
      clientIdsByOwner.set(item.queuedByUserId, clientIds);
    }
    await Promise.all(
      [...clientIdsByOwner].map(([ownerUserId, clientIds]) => operation(ownerUserId, clientIds)),
    );
  }
}
