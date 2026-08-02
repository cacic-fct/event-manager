import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AuthService,
  OralAttendanceComponent,
  OralAttendanceDecision,
  OralAttendancePerson,
} from '@cacic-fct/shared-angular';
import {
  EventAttendanceScannerFeedItem,
  EventAttendanceStatus,
} from '@cacic-fct/event-manager-admin-contracts';
import { firstValueFrom, fromEvent } from 'rxjs';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import { EventApiService } from '../../graphql/event-api.service';
import { OralAttendanceSyncFailureDialogComponent } from './oral-attendance-sync-failure-dialog.component';

interface PendingAdminDecision {
  eventId: string;
  personId: string;
  status: EventAttendanceStatus;
  collectedAt: string;
  queuedByUserId: string;
  queuedByLabel: string;
}

type SyncOutcome = 'synced' | 'failed' | 'retry';

const INITIAL_SYNC_DELAY_MS = 300;
const SYNC_RETRY_BASE_DELAY_MS = 1_000;
const SYNC_RETRY_MAX_DELAY_MS = 30_000;

@Component({
  selector: 'app-admin-oral-attendance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OralAttendanceComponent],
  template: `
    <lib-oral-attendance
      [title]="eventName()"
      [people]="people()"
      [decisions]="decisions()"
      [syncLabel]="syncLabel()"
      (backRequested)="goBack()"
      (decisionChanged)="registerDecision($event.person, $event.decision)"
      (manualSubmitted)="registerManual($event)" />
  `,
})
export class AdminOralAttendancePageComponent implements OnInit {
  private readonly api = inject(AttendanceApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly eventApi = inject(EventApiService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private eventId = '';
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncRetryAttempt = 0;

  protected readonly people = signal<OralAttendancePerson[]>([]);
  protected readonly eventName = signal('Chamada oral');
  protected readonly decisions = signal<ReadonlyMap<string, OralAttendanceDecision>>(new Map());
  protected readonly pending = signal<ReadonlyMap<string, PendingAdminDecision>>(new Map());
  protected readonly syncing = signal(false);
  protected readonly syncLabel = computed(() =>
    this.syncing()
      ? 'Sincronizando…'
      : this.pending().size
        ? `${this.pending().size} alterações pendentes`
        : 'Tudo sincronizado',
  );

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('eventId') ?? '';
    if (!this.eventId) {
      return;
    }
    this.restorePending();
    this.eventApi.getEvent(this.eventId).subscribe((event) => this.eventName.set(event.name));
    if (this.isBrowser) {
      fromEvent(window, 'online')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.scheduleSync());
    }
    this.api.listEventAttendanceOralRoster(this.eventId).subscribe((items) => this.applyRoster(items));
    this.scheduleSync();
  }

  protected goBack(): void {
    void this.router.navigate(['/attendances/event', this.eventId]);
  }

  protected registerDecision(person: OralAttendancePerson, decision: OralAttendanceDecision): void {
    const user = this.auth.user();
    if (!user?.sub) {
      this.snackbar.open('Entre novamente para registrar a chamada oral.', 'Fechar', { duration: 5000 });
      return;
    }
    const item: PendingAdminDecision = {
      eventId: this.eventId,
      personId: person.personId,
      status: decision,
      collectedAt: new Date().toISOString(),
      queuedByUserId: user.sub,
      queuedByLabel: user.preferredUsername ?? user.email ?? user.sub,
    };
    this.decisions.update((current) => new Map(current).set(person.personId, decision));
    this.pending.update((current) => new Map(current).set(person.personId, item));
    this.persistPending();
    this.scheduleSync();
  }

  protected registerManual(value: string): void {
    void firstValueFrom(this.api.createEventAttendanceFromManualInput({ eventId: this.eventId, value }))
      .then(() => this.snackbar.open('Presença manual registrada.', 'Fechar', { duration: 2500 }))
      .catch(() =>
        this.snackbar.open('Não foi possível registrar a presença manual.', 'Fechar', { duration: 5000 }),
      );
  }

  private scheduleSync(delayMs = this.syncRetryAttempt ? this.syncRetryDelay() : INITIAL_SYNC_DELAY_MS): void {
    if (!this.pending().size || this.syncTimer || (this.isBrowser && !navigator.onLine)) {
      return;
    }
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.syncPending();
    }, delayMs);
  }

  private applyRoster(items: EventAttendanceScannerFeedItem[]): void {
    this.people.set(
      items.map((item) => ({
        personId: item.personId,
        fullName: item.fullName || 'Nome não informado',
        identityDocument: item.identityDocument,
        unespRole: item.unespRole,
      })),
    );
    const decisions = new Map<string, OralAttendanceDecision>(
      items
        .filter((item): item is typeof item & { status: OralAttendanceDecision } => Boolean(item.status))
        .map((item) => [item.personId, item.status]),
    );
    this.pending().forEach((item) => decisions.set(item.personId, item.status));
    this.decisions.set(decisions);
  }

  private async syncPending(): Promise<void> {
    if (this.syncing() || !this.pending().size || (this.isBrowser && !navigator.onLine)) {
      return;
    }
    const items = [...this.pending().values()];
    const attemptedByPersonId = new Map(items.map((item) => [item.personId, item.collectedAt]));
    this.syncing.set(true);
    const failedItems: PendingAdminDecision[] = [];
    const permanentFailureItems: PendingAdminDecision[] = [];
    try {
      for (const item of items) {
        const outcome = await this.syncItem(item);
        if (outcome !== 'synced') {
          failedItems.push(item);
        }
        if (outcome === 'failed') {
          permanentFailureItems.push(item);
        }
        if (outcome !== 'retry') {
          this.pending.update((current) => {
            const next = new Map(current);
            if (next.get(item.personId)?.collectedAt === item.collectedAt) {
              next.delete(item.personId);
            }
            return next;
          });
          this.persistPending();
        }
      }
    } finally {
      this.syncing.set(false);
      const hasNewPendingItem = [...this.pending().values()].some(
        (item) => attemptedByPersonId.get(item.personId) !== item.collectedAt,
      );
      const hasRetryPending = failedItems.some(
        (item) => this.pending().get(item.personId)?.collectedAt === item.collectedAt,
      );
      if (hasRetryPending) {
        this.syncRetryAttempt += 1;
        this.scheduleSync(this.syncRetryDelay());
      } else {
        this.syncRetryAttempt = 0;
        if (hasNewPendingItem) {
          this.scheduleSync();
        }
      }
    }
    if (permanentFailureItems.length) {
      this.dialog.open(OralAttendanceSyncFailureDialogComponent, {
        width: 'min(30rem, 94vw)',
        maxWidth: '94vw',
        data: { failedCount: permanentFailureItems.length },
      });
    }
  }

  private syncRetryDelay(): number {
    return Math.min(
      SYNC_RETRY_MAX_DELAY_MS,
      SYNC_RETRY_BASE_DELAY_MS * 2 ** Math.min(this.syncRetryAttempt - 1, 5),
    );
  }

  private async syncItem(item: PendingAdminDecision): Promise<SyncOutcome> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await firstValueFrom(
          this.api.setEventOralAttendances([
            {
              eventId: item.eventId,
              personId: item.personId,
              status: item.status,
              collectedAt: item.collectedAt,
              collectedByUserId: item.queuedByUserId,
            },
          ]),
        );
        return 'synced';
      } catch (error: unknown) {
        if (!isRetryableSyncError(error)) {
          return 'failed';
        }
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** attempt));
        }
      }
    }
    return 'retry';
  }

  private storageKey(): string {
    return `admin-oral-attendance:${this.eventId}`;
  }

  private restorePending(): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(this.storageKey()) ?? '[]');
      const items = Array.isArray(stored)
        ? stored.filter((item): item is PendingAdminDecision => this.isPendingDecision(item))
        : [];
      const currentUserId = this.auth.user()?.sub;
      const recoveredFromAnotherUser = items.filter((item) => item.queuedByUserId !== currentUserId);
      const currentUserLabel = this.auth.user()?.preferredUsername ?? this.auth.user()?.email ?? currentUserId;
      this.pending.set(
        new Map(
          items.map((item) => [
            item.personId,
            item.queuedByUserId === currentUserId || !currentUserId || !currentUserLabel
              ? item
              : { ...item, queuedByUserId: currentUserId, queuedByLabel: currentUserLabel },
          ]),
        ),
      );
      this.persistPending();
      if (recoveredFromAnotherUser.length) {
        this.snackbar.open(
          `${recoveredFromAnotherUser.length} decisão(ões) salvas por outra conta serão enviadas pela conta atual se ela tiver permissão.`,
          'Fechar',
          { duration: 8000 },
        );
      }
    } catch {
      this.pending.set(new Map());
    }
  }

  private persistPending(): void {
    if (this.isBrowser) {
      localStorage.setItem(this.storageKey(), JSON.stringify([...this.pending().values()]));
    }
  }

  private isPendingDecision(value: unknown): value is PendingAdminDecision {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const item = value as Partial<PendingAdminDecision>;
    return (
      item.eventId === this.eventId &&
      typeof item.personId === 'string' &&
      (item.status === 'PRESENT' || item.status === 'ABSENT') &&
      typeof item.collectedAt === 'string' &&
      typeof item.queuedByUserId === 'string' &&
      typeof item.queuedByLabel === 'string'
    );
  }
}

export function isRetryableSyncError(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500)
  );
}
