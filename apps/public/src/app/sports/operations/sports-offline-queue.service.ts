import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import {
  hasOfflineSportsAttendanceCollectorProof,
  isOfflineSportsOfficialCheckIn,
  OfflineSportsCollectorCredential,
  SportsOperationOfflineQueueService,
} from '@cacic-fct/public-indexed-db';
import { AuthService } from '@cacic-fct/shared-angular';
import { firstValueFrom, Subscription } from 'rxjs';
import { NetworkStatusService } from '../../shared/network-status.service';
import { isSportsTimerAction } from './official-match-page.utils';
import { SportsOperationsApiService } from './sports-operations-api.service';
import {
  QueuedSportsOperation,
  SportsMatchAction,
  SportsOfficialCheckIn,
  SportsRosterCheckIn,
  SportsScannerCheckIn,
  SportsTimerConflict,
  SportsTimerSnapshot,
} from './sports-operations.types';

const MAX_ATTEMPTS_PER_SYNC = 3;

@Injectable({ providedIn: 'root' })
export class SportsOfflineQueueService implements OnDestroy {
  private readonly api = inject(SportsOperationsApiService);
  private readonly auth = inject(AuthService);
  private readonly network = inject(NetworkStatusService);
  private readonly storage = inject(SportsOperationOfflineQueueService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly subscriptions = new Subscription();
  private syncing = false;
  private started = false;
  private pendingLoadRevision = 0;
  private readonly requestedCollectorMatches = new Set<string>();
  private readonly collectorPreparations = new Map<string, Promise<boolean>>();

  private readonly pendingState = signal<QueuedSportsOperation[]>([]);
  readonly pending = this.pendingState.asReadonly();
  private readonly preparedCollectorKeys = signal<ReadonlySet<string>>(new Set());
  private readonly timerConflictState = signal<SportsTimerConflict | null>(null);
  readonly timerConflict = this.timerConflictState.asReadonly();
  private readonly userScopeEffect = effect(() => {
    const userScope = this.auth.user()?.sub;
    if (!userScope) {
      this.pendingState.set([]);
      return;
    }
    if (this.started && this.isBrowser) {
      void this.refreshPending(userScope);
      this.requestedCollectorMatches.forEach((matchId) => void this.prepareCollector(matchId));
    }
  });

  start(): void {
    if (!this.isBrowser) {
      return;
    }
    void this.refreshPending();
    if (this.started) {
      if (this.network.isOnline()) {
        void this.sync();
      }
      return;
    }

    this.started = true;
    this.network.start();
    this.subscriptions.add(
      this.network.watchStatusChanges().subscribe((status) => {
        if (status === 'online') {
          this.requestedCollectorMatches.forEach((matchId) => void this.prepareCollector(matchId));
          void this.sync();
        }
      }),
    );
    if (this.network.isOnline()) {
      void this.sync();
    }
  }

  async dispatch(action: SportsMatchAction): Promise<'sent' | 'queued'> {
    if (this.network.isOnline()) {
      try {
        await firstValueFrom(this.api.commit([action]));
        return 'sent';
      } catch (error: unknown) {
        if (!this.isConnectionFailure(error)) {
          throw error;
        }
      }
    }
    await this.enqueueAction(action);
    return 'queued';
  }

  async dispatchCheckIn(checkIn: SportsRosterCheckIn): Promise<'sent' | 'queued'> {
    await this.prepareCollector(checkIn.matchId);
    if (this.network.isOnline()) {
      try {
        await firstValueFrom(this.api.checkIn(checkIn));
        return 'sent';
      } catch (error: unknown) {
        if (!this.isConnectionFailure(error)) {
          throw error;
        }
      }
    }
    await this.enqueueCheckIn(checkIn);
    return 'queued';
  }

  async dispatchOfficialCheckIn(checkIn: SportsOfficialCheckIn): Promise<'sent' | 'queued'> {
    await this.prepareCollector(checkIn.matchId);
    if (this.network.isOnline()) {
      try {
        await firstValueFrom(this.api.checkInOfficial(checkIn));
        return 'sent';
      } catch (error: unknown) {
        if (!this.isConnectionFailure(error)) {
          throw error;
        }
      }
    }
    await this.enqueueOfficialCheckIn(checkIn);
    return 'queued';
  }

  async dispatchScannerCheckIn(scannerCheckIn: SportsScannerCheckIn): Promise<'sent' | 'queued'> {
    await this.prepareCollector(scannerCheckIn.matchId);
    if (this.network.isOnline()) {
      try {
        await firstValueFrom(this.api.checkInFromScanner(scannerCheckIn));
        return 'sent';
      } catch (error: unknown) {
        if (!this.isConnectionFailure(error)) {
          throw error;
        }
      }
    }
    const userScope = this.requireUserScope();
    const collector = await this.requireCollectorCredential(userScope, scannerCheckIn.matchId);
    await this.storage.enqueue({
      kind: 'SCANNER',
      id: scannerCheckIn.clientId,
      userScope,
      scannerCheckIn: {
        ...scannerCheckIn,
        offline: true,
        collectorPersonId: collector.collectorPersonId,
        collectorCredential: collector.credential,
      },
      attempts: 0,
      queuedAt: new Date().toISOString(),
    });
    await this.refreshPending(userScope);
    return 'queued';
  }

  async enqueueAction(action: SportsMatchAction): Promise<void> {
    const userScope = this.requireUserScope();
    await this.storage.enqueue({
      kind: 'ACTION',
      id: action.clientId,
      userScope,
      action: { ...action, offline: true },
      attempts: 0,
      queuedAt: new Date().toISOString(),
    });
    await this.refreshPending(userScope);
  }

  async attachTimerSnapshot(clientId: string, snapshot: SportsTimerSnapshot): Promise<void> {
    const userScope = this.auth.user()?.sub;
    if (!userScope) {
      return;
    }
    await this.storage.attachTimerSnapshot(userScope, clientId, snapshot);
    await this.refreshPending(userScope);
  }

  async enqueueCheckIn(checkIn: SportsRosterCheckIn): Promise<void> {
    await this.enqueueAttendanceCheckIn(checkIn);
  }

  async enqueueOfficialCheckIn(checkIn: SportsOfficialCheckIn): Promise<void> {
    await this.enqueueAttendanceCheckIn(checkIn);
  }

  private async enqueueAttendanceCheckIn(checkIn: SportsRosterCheckIn | SportsOfficialCheckIn): Promise<void> {
    const userScope = this.requireUserScope();
    const collector = await this.requireCollectorCredential(userScope, checkIn.matchId);
    await this.storage.enqueue({
      kind: 'CHECK_IN',
      id: checkIn.clientId,
      userScope,
      checkIn: {
        ...checkIn,
        offline: true,
        collectorPersonId: collector.collectorPersonId,
        collectorCredential: collector.credential,
      },
      attempts: 0,
      queuedAt: new Date().toISOString(),
    });
    await this.refreshPending(userScope);
  }

  pendingForMatch(matchId: string): number {
    const userScope = this.auth.user()?.sub;
    if (!userScope) {
      return 0;
    }
    return this.pendingState().filter(
      (item) =>
        this.isUploadableBy(item, userScope) &&
        (item.kind === 'ACTION'
          ? item.action.matchId === matchId
          : item.kind === 'CHECK_IN'
            ? item.checkIn.matchId === matchId
            : item.scannerCheckIn.matchId === matchId),
    ).length;
  }

  retainedActionCountForMatch(matchId: string): number {
    const userScope = this.auth.user()?.sub;
    if (!userScope) {
      return 0;
    }
    return this.pendingState().filter(
      (item) => item.kind === 'ACTION' && item.userScope !== userScope && item.action.matchId === matchId,
    ).length;
  }

  unverifiedAttendanceCountForMatch(matchId: string): number {
    return this.pendingState().filter(
      (item) =>
        item.kind !== 'ACTION' &&
        !hasOfflineSportsAttendanceCollectorProof(item) &&
        (item.kind === 'CHECK_IN' ? item.checkIn.matchId === matchId : item.scannerCheckIn.matchId === matchId),
    ).length;
  }

  canCollectAttendance(matchId: string): boolean {
    const userScope = this.auth.user()?.sub;
    return Boolean(
      userScope && (this.network.isOnline() || this.preparedCollectorKeys().has(this.collectorKey(userScope, matchId))),
    );
  }

  async prepareCollector(matchId: string): Promise<boolean> {
    const userScope = this.auth.user()?.sub;
    if (!userScope || !matchId) {
      return false;
    }
    this.requestedCollectorMatches.add(matchId);
    const key = this.collectorKey(userScope, matchId);
    const running = this.collectorPreparations.get(key);
    if (running) {
      return running;
    }
    const preparation = this.loadOrCreateCollectorCredential(userScope, matchId).finally(() => {
      this.collectorPreparations.delete(key);
    });
    this.collectorPreparations.set(key, preparation);
    return preparation;
  }

  async sync(): Promise<void> {
    if (this.syncing || !this.isBrowser || !this.network.isOnline()) {
      return;
    }
    const userScope = this.auth.user()?.sub;
    if (!userScope) {
      return;
    }

    this.syncing = true;
    try {
      const pendingAtStart = await this.storage.listUploadable(userScope);
      const conflictedMatches = new Set<string>();
      for (const item of pendingAtStart) {
        if (item.kind === 'ACTION' && conflictedMatches.has(item.action.matchId)) {
          continue;
        }

        let accepted = false;
        let lastError: unknown;
        for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_SYNC; attempt++) {
          try {
            if (item.kind === 'ACTION') {
              await firstValueFrom(this.api.commit([{ ...item.action, offline: true }]));
            } else if (item.kind === 'CHECK_IN') {
              if (isOfflineSportsOfficialCheckIn(item.checkIn)) {
                await firstValueFrom(this.api.checkInOfficial({ ...item.checkIn, offline: true }));
              } else {
                await firstValueFrom(this.api.checkIn({ ...item.checkIn, offline: true }));
              }
            } else {
              await firstValueFrom(this.api.checkInFromScanner({ ...item.scannerCheckIn, offline: true }));
            }
            accepted = true;
            break;
          } catch (error: unknown) {
            lastError = error;
            if (!this.isConnectionFailure(error)) {
              break;
            }
          }
        }

        if (accepted) {
          await this.storage.remove(item.userScope, item.id);
          continue;
        }

        if (item.kind === 'ACTION' && item.timerSnapshot && this.isTimerConflict(lastError)) {
          const matchId = item.action.matchId;
          conflictedMatches.add(matchId);
          const timerItems = pendingAtStart.filter(
            (candidate) =>
              candidate.kind === 'ACTION' &&
              candidate.action.matchId === matchId &&
              candidate.timerSnapshot &&
              this.isTimerAction(candidate.action),
          );
          const latest = timerItems.at(-1);
          if (latest?.kind === 'ACTION' && latest.timerSnapshot) {
            this.timerConflictState.set({
              matchId,
              queuedActionIds: timerItems.map((candidate) => candidate.id),
              device: latest.timerSnapshot,
            });
          }
        }

        await this.storage.recordFailure(
          item.userScope,
          item.id,
          lastError instanceof Error ? lastError.message : 'Não foi possível sincronizar.',
        );
      }
    } finally {
      this.syncing = false;
      await this.refreshPending();
    }
  }

  async discard(clientId: string): Promise<void> {
    const userScope = this.auth.user()?.sub;
    if (!userScope) {
      return;
    }
    await this.storage.remove(userScope, clientId);
    await this.refreshPending(userScope);
  }

  async resolveTimerConflict(matchId: string, queuedActionIds: readonly string[], baseRevision: number): Promise<void> {
    const userScope = this.auth.user()?.sub;
    if (!userScope) {
      return;
    }
    await this.storage.resolveTimerConflict(userScope, matchId, queuedActionIds, baseRevision);
    await this.refreshPending(userScope);
    if (this.timerConflictState()?.matchId === matchId) {
      this.timerConflictState.set(null);
    }
  }

  postponeTimerConflict(matchId: string): void {
    if (this.timerConflictState()?.matchId === matchId) {
      this.timerConflictState.set(null);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private async refreshPending(userScope = this.auth.user()?.sub): Promise<void> {
    const loadRevision = ++this.pendingLoadRevision;
    if (!userScope) {
      this.pendingState.set([]);
      return;
    }

    const items = await this.storage.listAll();
    if (loadRevision === this.pendingLoadRevision && this.auth.user()?.sub === userScope) {
      this.pendingState.set(items);
    }
  }

  private requireUserScope(): string {
    const userScope = this.auth.user()?.sub;
    if (!userScope) {
      throw new Error('Não foi possível identificar a pessoa responsável pela operação off-line.');
    }
    return userScope;
  }

  private async loadOrCreateCollectorCredential(userScope: string, matchId: string): Promise<boolean> {
    try {
      const cached = await this.storage.getCollectorCredential(userScope, matchId);
      if (cached) {
        this.markCollectorPrepared(userScope, matchId);
        return true;
      }
      if (!this.network.isOnline()) {
        return false;
      }
      const issued = await firstValueFrom(this.api.createOfflineCollectorCredential(matchId));
      await this.storage.saveCollectorCredential({
        ...issued,
        userScope,
        matchId,
      });
      this.markCollectorPrepared(userScope, matchId);
      return true;
    } catch {
      return false;
    }
  }

  private async requireCollectorCredential(
    userScope: string,
    matchId: string,
  ): Promise<OfflineSportsCollectorCredential> {
    const credential = await this.storage.getCollectorCredential(userScope, matchId);
    if (!credential) {
      throw new Error(
        'A coleta off-line ainda não foi preparada para esta partida. Conecte este dispositivo antes de coletar presenças.',
      );
    }
    return credential;
  }

  private markCollectorPrepared(userScope: string, matchId: string): void {
    this.preparedCollectorKeys.update((keys) => new Set([...keys, this.collectorKey(userScope, matchId)]));
  }

  private collectorKey(userScope: string, matchId: string): string {
    return `${userScope}\u0000${matchId}`;
  }

  private isConnectionFailure(error: unknown): boolean {
    if (error instanceof HttpErrorResponse) {
      return error.status === 0;
    }
    if (!(error instanceof Error)) {
      return true;
    }
    return /network|offline|fetch|connection|status 0/i.test(error.message);
  }

  private isUploadableBy(item: QueuedSportsOperation, userScope: string): boolean {
    return item.kind === 'ACTION' ? item.userScope === userScope : hasOfflineSportsAttendanceCollectorProof(item);
  }

  private isTimerConflict(error: unknown): boolean {
    return error instanceof Error && /partida mudou|expectedrevision|revis[aã]o|revision/i.test(error.message);
  }

  private isTimerAction(action: SportsMatchAction): boolean {
    if (action.type !== 'SCORE_CORRECTION') {
      return isSportsTimerAction(action.type);
    }
    try {
      const payload: unknown = JSON.parse(action.payloadJson) as unknown;
      return isSportsTimerAction(action.type, payload);
    } catch {
      return false;
    }
  }
}
