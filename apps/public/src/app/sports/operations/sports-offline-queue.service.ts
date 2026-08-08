import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { firstValueFrom, Subscription } from 'rxjs';
import { NetworkStatusService } from '../../shared/network-status.service';
import { SportsOperationsApiService } from './sports-operations-api.service';
import {
  QueuedSportsOperation,
  SportsMatchAction,
  SportsRosterCheckIn,
  SportsScannerCheckIn,
  SportsTimerConflict,
  SportsTimerSnapshot,
} from './sports-operations.types';

const STORAGE_KEY = 'fct:sports:operations:v2';
const MAX_ATTEMPTS_PER_SYNC = 3;

@Injectable({ providedIn: 'root' })
export class SportsOfflineQueueService implements OnDestroy {
  private readonly api = inject(SportsOperationsApiService);
  private readonly auth = inject(AuthService);
  private readonly network = inject(NetworkStatusService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly subscriptions = new Subscription();
  private syncing = false;

  private readonly pendingState = signal<QueuedSportsOperation[]>(this.read());
  readonly pending = this.pendingState.asReadonly();
  private readonly timerConflictState = signal<SportsTimerConflict | null>(null);
  readonly timerConflict = this.timerConflictState.asReadonly();

  start(): void {
    if (!this.isBrowser) {
      return;
    }
    this.network.start();
    this.subscriptions.add(
      this.network.watchStatusChanges().subscribe((status) => {
        if (status === 'online') {
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
    this.enqueueAction(action);
    return 'queued';
  }

  async dispatchCheckIn(checkIn: SportsRosterCheckIn): Promise<'sent' | 'queued'> {
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
    this.enqueueCheckIn(checkIn);
    return 'queued';
  }

  async dispatchScannerCheckIn(scannerCheckIn: SportsScannerCheckIn): Promise<'sent' | 'queued'> {
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
    const userScope = this.auth.user()?.sub ?? 'anonymous';
    if (!this.pendingState().some((item) => item.id === scannerCheckIn.clientId)) {
      this.persist([
        ...this.pendingState(),
        {
          kind: 'SCANNER',
          id: scannerCheckIn.clientId,
          userScope,
          scannerCheckIn: { ...scannerCheckIn, offline: true },
          attempts: 0,
          queuedAt: new Date().toISOString(),
        },
      ]);
    }
    return 'queued';
  }

  enqueueAction(action: SportsMatchAction): void {
    const userScope = this.auth.user()?.sub ?? 'anonymous';
    if (this.pendingState().some((item) => item.id === action.clientId)) {
      return;
    }
    this.persist([
      ...this.pendingState(),
      {
        kind: 'ACTION',
        id: action.clientId,
        userScope,
        action: { ...action, offline: true },
        attempts: 0,
        queuedAt: new Date().toISOString(),
      },
    ]);
  }

  attachTimerSnapshot(clientId: string, snapshot: SportsTimerSnapshot): void {
    this.persist(
      this.pendingState().map((item) =>
        item.kind === 'ACTION' && item.id === clientId ? { ...item, timerSnapshot: snapshot } : item,
      ),
    );
  }

  enqueueCheckIn(checkIn: SportsRosterCheckIn): void {
    const userScope = this.auth.user()?.sub ?? 'anonymous';
    if (this.pendingState().some((item) => item.id === checkIn.clientId)) {
      return;
    }
    this.persist([
      ...this.pendingState(),
      {
        kind: 'CHECK_IN',
        id: checkIn.clientId,
        userScope,
        checkIn: { ...checkIn, offline: true },
        attempts: 0,
        queuedAt: new Date().toISOString(),
      },
    ]);
  }

  pendingForMatch(matchId: string): number {
    const userScope = this.auth.user()?.sub;
    if (!userScope) {
      return 0;
    }
    return this.pendingState().filter(
      (item) =>
        item.userScope === userScope &&
        (item.kind === 'ACTION'
          ? item.action.matchId === matchId
          : item.kind === 'CHECK_IN'
            ? item.checkIn.matchId === matchId
            : item.scannerCheckIn.matchId === matchId),
    ).length;
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
      const pendingAtStart = this.pendingState();
      const remaining: QueuedSportsOperation[] = [];
      const conflictedMatches = new Set<string>();
      for (const item of pendingAtStart) {
        if (item.userScope !== userScope) {
          remaining.push(item);
          continue;
        }
        if (item.kind === 'ACTION' && conflictedMatches.has(item.action.matchId)) {
          remaining.push(item);
          continue;
        }
        let accepted = false;
        let lastError: unknown;
        for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_SYNC; attempt++) {
          try {
            if (item.kind === 'ACTION') {
              await firstValueFrom(this.api.commit([{ ...item.action, offline: true }]));
            } else if (item.kind === 'CHECK_IN') {
              await firstValueFrom(this.api.checkIn({ ...item.checkIn, offline: true }));
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
        if (!accepted) {
          if (item.kind === 'ACTION' && item.timerSnapshot && this.isTimerConflict(lastError)) {
            const matchId = item.action.matchId;
            conflictedMatches.add(matchId);
            const timerItems = pendingAtStart.filter(
              (candidate) =>
                candidate.kind === 'ACTION' &&
                candidate.userScope === userScope &&
                candidate.action.matchId === matchId &&
                candidate.timerSnapshot &&
                this.isTimerAction(candidate.action.type),
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
          remaining.push({
            ...item,
            attempts: item.attempts + 1,
            lastError: lastError instanceof Error ? lastError.message : 'Não foi possível sincronizar.',
          });
        }
      }
      const queuedDuringSync = this.pendingState().filter(
        (item) => !pendingAtStart.some((initial) => initial.id === item.id),
      );
      this.persist([...remaining, ...queuedDuringSync]);
    } finally {
      this.syncing = false;
    }
  }

  discard(clientId: string): void {
    this.persist(this.pendingState().filter((item) => item.id !== clientId));
  }

  resolveTimerConflict(matchId: string, queuedActionIds: readonly string[], baseRevision: number): void {
    const userScope = this.auth.user()?.sub;
    if (!userScope) {
      return;
    }
    const ids = new Set(queuedActionIds);
    let nextRevision = baseRevision;
    const rebased = this.pendingState().flatMap((item): QueuedSportsOperation[] => {
      if (item.userScope !== userScope || item.kind !== 'ACTION' || item.action.matchId !== matchId) {
        return [item];
      }
      if (ids.has(item.id)) {
        return [];
      }
      const result = { ...item, action: { ...item.action, baseRevision: nextRevision } };
      nextRevision += 1;
      return [result];
    });
    this.persist(rebased);
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

  private read(): QueuedSportsOperation[] {
    if (!this.isBrowser) {
      return [];
    }
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
      return Array.isArray(parsed) ? (parsed as QueuedSportsOperation[]) : [];
    } catch {
      return [];
    }
  }

  private persist(items: QueuedSportsOperation[]): void {
    this.pendingState.set(items);
    if (this.isBrowser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
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

  private isTimerConflict(error: unknown): boolean {
    return error instanceof Error && /partida mudou|expectedrevision|revis[aã]o|revision/i.test(error.message);
  }

  private isTimerAction(type: SportsMatchAction['type']): boolean {
    return (
      type === 'START' || type === 'PAUSE' || type === 'RESUME' || type === 'PERIOD_ROLL' || type === 'TIMER_RECONCILE'
    );
  }
}
