import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AttendanceOfflineQueueService,
  OralAttendanceOfflineService,
} from '@cacic-fct/offline-public-data-access';
import {
  AuthService,
  OralAttendanceComponent,
  OralAttendanceDecision,
  OralAttendancePerson,
} from '@cacic-fct/shared-angular';
import { NetworkStatusService } from '../../../shared/network-status.service';
import { AttendanceCollectionAccessService } from '../access.service';
import {
  AttendanceCollectionApiService,
  AttendanceCollectionEvent,
  AttendanceCollectionLocation,
  AttendanceScannerFeedItem,
} from '../attendance-collection-api.service';
import { AttendanceOfflineSyncService } from '../offline/sync.service';

@Component({
  selector: 'app-oral-attendance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OralAttendanceComponent],
  template: `
    @if (event(); as selectedEvent) {
      <lib-oral-attendance
        [title]="selectedEvent.event.name"
        [people]="people()"
        [decisions]="decisions()"
        [syncLabel]="syncLabel()"
        (backRequested)="goBack()"
        (decisionChanged)="registerDecision($event.person, $event.decision)"
        (manualSubmitted)="registerManual($event)" />
    } @else {
      <main class="loading-state">Carregando chamada oral…</main>
    }
  `,
  styles: `
    .loading-state { display: grid; min-height: 60vh; place-items: center; color: var(--mat-sys-on-surface-variant); }
  `,
})
export class OralAttendancePage implements OnInit {
  private readonly access = inject(AttendanceCollectionAccessService);
  private readonly api = inject(AttendanceCollectionApiService);
  private readonly auth = inject(AuthService);
  private readonly collectionEventsQueue = inject(AttendanceOfflineQueueService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly manualQueue = inject(AttendanceOfflineQueueService);
  private readonly offlineSync = inject(AttendanceOfflineSyncService);
  private readonly network = inject(NetworkStatusService);
  private readonly offline = inject(OralAttendanceOfflineService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);

  protected readonly event = signal<AttendanceCollectionEvent | null>(null);
  protected readonly people = signal<OralAttendancePerson[]>([]);
  protected readonly decisions = signal<ReadonlyMap<string, OralAttendanceDecision>>(new Map());
  protected readonly pendingCount = signal(0);
  protected readonly syncLabel = computed(() =>
    !this.network.isOnline()
      ? `${this.pendingCount()} alterações salvas off-line`
      : this.pendingCount()
        ? `${this.pendingCount()} alterações pendentes`
        : 'Tudo sincronizado',
  );

  constructor() {
    effect(() => {
      if (this.network.isOnline()) {
        void this.offlineSync.syncPending();
      }
    });
  }

  ngOnInit(): void {
    const eventId = this.route.snapshot.paramMap.get('eventId');
    const userId = this.auth.user()?.sub;
    if (!eventId || !userId) {
      void this.router.navigate(['/attendance/collect']);
      return;
    }
    this.offline
      .watchPending(userId, eventId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((items) => this.pendingCount.set(items.length));
    this.api.listCollectionEvents().subscribe({
      next: (events) => {
        const selected = events.find((item) => item.eventId === eventId) ?? null;
        if (!selected?.event.shouldAllowOralAttendance) {
          void this.router.navigate(['/attendance/collect']);
          return;
        }
        this.event.set(selected);
        this.loadRoster(eventId, userId);
      },
      error: () => void this.loadCached(eventId, userId),
    });
  }

  protected goBack(): void {
    const eventId = this.event()?.eventId;
    void this.router.navigate(eventId ? ['/attendance/collect', eventId, 'method'] : ['/attendance/collect']);
  }

  protected async registerDecision(
    person: OralAttendancePerson,
    decision: OralAttendanceDecision,
  ): Promise<void> {
    const eventId = this.event()?.eventId;
    const userId = this.auth.user()?.sub;
    if (!eventId || !userId) {
      return;
    }
    let location: AttendanceCollectionLocation;
    try {
      location = await this.access.getPreciseLocation();
    } catch {
      this.snackbar.open('Não foi possível obter sua localização. Tente novamente para registrar a chamada.', 'Fechar', {
        duration: 5000,
      });
      return;
    }
    const collectedAt = new Date().toISOString();
    this.decisions.update((current) => new Map(current).set(person.personId, decision));
    await this.offline.enqueue({
      queuedByUserId: userId,
      eventId,
      personId: person.personId,
      status: decision,
      location,
      collectedAt,
      lastError: null,
    });
    void this.offlineSync.syncPending();
  }

  protected async registerManual(value: string): Promise<void> {
    const selected = this.event();
    const user = this.auth.user();
    if (!selected || !user?.sub) {
      return;
    }
    let location: AttendanceCollectionLocation;
    try {
      location = await this.access.getPreciseLocation();
    } catch {
      this.snackbar.open('Não foi possível obter sua localização. Tente novamente para registrar a presença.', 'Fechar', {
        duration: 5000,
      });
      return;
    }
    await this.manualQueue.enqueue({
      clientId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      queuedByUserId: user.sub,
      eventId: selected.eventId,
      eventName: selected.event.name,
      createdByMethod: 'MANUAL_INPUT',
      value,
      location,
      collectedAt: new Date().toISOString(),
      queuedAt: Date.now(),
      updatedAt: Date.now(),
      authorUserId: user.sub,
      authorName: user.preferredUsername ?? null,
      authorEmail: user.email ?? null,
      status: 'PENDING',
      attempts: 0,
      lastError: null,
    });
    this.snackbar.open('Registro manual salvo. A sincronização continuará em segundo plano.', 'Fechar', {
      duration: 3200,
    });
    void this.offlineSync.syncPending();
  }

  private loadRoster(eventId: string, userId: string): void {
    this.api.listOralRoster(eventId).subscribe({
      next: (items) => void this.applyRoster(items, userId, eventId),
      error: () => void this.loadCached(eventId, userId),
    });
  }

  private async applyRoster(
    items: AttendanceScannerFeedItem[],
    userId: string,
    eventId: string,
  ): Promise<void> {
    const people = items.map((item) => ({
      personId: item.personId,
      fullName: item.fullName || 'Nome não informado',
      identityDocument: item.identityDocument,
      unespRole: item.unespRole,
    }));
    const decisions = new Map<string, OralAttendanceDecision>(
      items
        .filter((item): item is typeof item & { status: OralAttendanceDecision } => Boolean(item.status))
        .map((item) => [item.personId, item.status]),
    );
    const savedDecisions = await this.offline.listAll(userId, eventId);
    savedDecisions
      .filter((item) => !item.syncedAt)
      .forEach((item) => decisions.set(item.personId, item.status));
    this.people.set(people);
    this.decisions.set(decisions);
    await this.offline.cacheRoster(userId, eventId, people);
  }

  private async loadCached(eventId: string, userId: string): Promise<void> {
    const [event, people, savedDecisions] = await Promise.all([
      this.collectionEventsQueue.getCollectionEvent(userId, eventId),
      this.offline.getRoster(userId, eventId),
      this.offline.listAll(userId, eventId),
    ]);
    if (!event?.event.shouldAllowOralAttendance) {
      void this.router.navigate(['/attendance/collect']);
      return;
    }
    this.event.set(event);
    this.people.set(people);
    this.decisions.set(new Map(savedDecisions.map((item) => [item.personId, item.status])));
  }

}
