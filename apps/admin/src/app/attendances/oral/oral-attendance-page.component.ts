import { isPlatformBrowser } from '@angular/common';
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

interface PendingAdminDecision {
  eventId: string;
  personId: string;
  status: EventAttendanceStatus;
  collectedAt: string;
  queuedByUserId: string;
  queuedByLabel: string;
}

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
  private readonly eventApi = inject(EventApiService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private eventId = '';
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.api
      .watchEventAttendanceOralRoster(this.eventId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((items) => this.applyRoster(items));
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

  private scheduleSync(): void {
    if (!this.pending().size || this.syncTimer) {
      return;
    }
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.syncPending();
    }, 300);
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
    if (this.syncing() || !this.pending().size) {
      return;
    }
    const items = [...this.pending().values()];
    this.syncing.set(true);
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await firstValueFrom(
            this.api.setEventOralAttendances(
              items.map(({ eventId, personId, status, collectedAt, queuedByUserId }) => ({
                eventId,
                personId,
                status,
                collectedAt,
                collectedByUserId: queuedByUserId,
              })),
            ),
          );
          this.pending.update((current) => {
            const next = new Map(current);
            items.forEach((item) => {
              if (next.get(item.personId)?.collectedAt === item.collectedAt) {
                next.delete(item.personId);
              }
            });
            return next;
          });
          this.persistPending();
          this.scheduleSync();
          return;
        } catch {
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** attempt));
          }
        }
      }
      this.snackbar.open('Não foi possível sincronizar após 3 tentativas. As alterações continuam salvas.', 'Fechar', {
        duration: 6000,
      });
    } finally {
      this.syncing.set(false);
    }
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
      this.pending.set(new Map(items.map((item) => [item.personId, item])));
      const currentUserId = this.auth.user()?.sub;
      const recoveredFromAnotherUser = items.filter((item) => item.queuedByUserId !== currentUserId);
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
