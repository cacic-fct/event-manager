import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { firstValueFrom, Subscription } from 'rxjs';
import { NetworkStatusService } from '../../shared/network-status.service';
import { SportsOperationsApiService } from './sports-operations-api.service';
import {
  QueuedSportsOperation,
  SportsMatchAction,
  SportsRosterCheckIn,
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
    return this.pendingState().filter((item) =>
      item.kind === 'ACTION'
        ? item.action.matchId === matchId
        : item.checkIn.matchId === matchId,
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
      const remaining: QueuedSportsOperation[] = [];
      for (const item of this.pendingState()) {
        if (item.userScope !== userScope) {
          remaining.push(item);
          continue;
        }
        let accepted = false;
        let lastError: unknown;
        for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_SYNC; attempt++) {
          try {
            if (item.kind === 'ACTION') {
              await firstValueFrom(this.api.commit([{ ...item.action, offline: true }]));
            } else {
              await firstValueFrom(this.api.checkIn({ ...item.checkIn, offline: true }));
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
          remaining.push({
            ...item,
            attempts: item.attempts + 1,
            lastError: lastError instanceof Error ? lastError.message : 'Não foi possível sincronizar.',
          });
        }
      }
      this.persist(remaining);
    } finally {
      this.syncing = false;
    }
  }

  discard(clientId: string): void {
    this.persist(this.pendingState().filter((item) => item.id !== clientId));
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
    if (!(error instanceof Error)) {
      return true;
    }
    return /network|offline|fetch|connection|status 0/i.test(error.message);
  }
}
