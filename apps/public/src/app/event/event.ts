import { DatePipe, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import {
  PublicEvent,
  formatCreditMinutes,
  formatDateRange,
  getEventTypeLabel,
  isOnlineAttendanceRegistrationOpen,
} from '@cacic-fct/shared-utils';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Observable, catchError, combineLatest, finalize, map, of, startWith, switchMap } from 'rxjs';
import { EventApiService, EventPageData } from './event-api.service';
import { EventLocationMap } from './event-location-map';
import { EmojiService } from '../profile/attendances/emoji.service';
import { NetworkStatusService } from '../shared/network-status.service';

type EventPageState =
  | { status: 'loading' }
  | { status: 'ready'; data: EventPageData }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-event',
  imports: [
    DatePipe,
    EventLocationMap,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
  templateUrl: './event.html',
  styleUrl: './event.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Event {
  private readonly api = inject(EventApiService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly snackBar = inject(MatSnackBar);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly emoji = inject(EmojiService);
  readonly isAuthenticated = this.authService.isAuthenticated;
  readonly isOnline = this.networkStatus.isOnline;
  readonly isSubscribing = signal(false);
  readonly isConfirmingAttendance = signal(false);

  private readonly reloadCounter = signal(0);

  private readonly returnUrl = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('returnUrl') || '/menu')),
    { initialValue: '/menu' },
  );

  readonly eventState = toSignal(this.createEventState(), {
    initialValue: { status: 'loading' } satisfies EventPageState,
  });

  readonly backUrl = computed(() => this.returnUrl());

  goBack(): void {
    void this.router.navigateByUrl(this.backUrl());
  }

  async shareEvent(): Promise<void> {
    if (!this.isBrowser || !navigator.clipboard) {
      return;
    }

    const url = new URL(this.router.url, document.baseURI).toString();

    await navigator.clipboard.writeText(url);

    this.snackBar.open('Link copiado para a área de transferência.', 'OK', {
      duration: 3000,
    });
  }

  subscribe(data: EventPageData): void {
    if (!this.isBrowser) {
      return;
    }

    if (!this.isAuthenticated()) {
      void this.authService.login();
      return;
    }

    if (!this.canSubscribe(data) || this.isSubscribing()) {
      return;
    }

    this.isSubscribing.set(true);

    this.api
      .subscribeToEvent(data.event.id)
      .pipe(
        finalize(() => this.isSubscribing.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.snackBar.open('Inscrição realizada.', 'OK', { duration: 3000 });
          this.reload();
        },
        error: (error: unknown) => this.showError(error),
      });
  }

  confirmAttendance(data: EventPageData): void {
    if (!this.isBrowser) {
      return;
    }

    if (!this.isAuthenticated()) {
      void this.authService.login();
      return;
    }

    if (!this.canConfirmAttendance(data.event) || data.currentUserAttendance) {
      return;
    }

    void this.router.navigate(['/attendance/register', data.event.id], {
      queryParams: {
        returnUrl: this.router.url,
      },
    });
  }

  copyId(id: string): void {
    if (!this.isBrowser || !navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(id);

    this.snackBar.open('ID do evento copiado para a área de transferência.', 'OK', { duration: 3000 });
  }

  canSubscribe(data: EventPageData): boolean {
    const now = Date.now();
    const event = data.event;
    const subscriptionStart = event.subscriptionStartDate ?? event.majorEvent?.subscriptionStartDate;
    const subscriptionEnd = event.subscriptionEndDate ?? event.majorEvent?.subscriptionEndDate;

    return (
      Boolean(event.allowSubscription) &&
      this.isOnline() &&
      !data.currentUserSubscription &&
      data.subscriptionSummary.hasAvailableSlots &&
      Date.parse(event.startDate) > now &&
      (!subscriptionStart || Date.parse(subscriptionStart) <= now) &&
      (!subscriptionEnd || Date.parse(subscriptionEnd) >= now)
    );
  }

  canConfirmAttendance(event: PublicEvent): boolean {
    return isOnlineAttendanceRegistrationOpen(event);
  }

  dateLine(event: PublicEvent): string {
    return formatDateRange(event.startDate, event.endDate);
  }

  eventTypeLabel(event: PublicEvent): string {
    return getEventTypeLabel(event.type);
  }

  creditLine(event: PublicEvent): string | null {
    return event.creditMinutes ? formatCreditMinutes(event.creditMinutes) : null;
  }

  subscriptionStatusLine(data: EventPageData): string {
    if (data.currentUserSubscription) {
      return '';
    }

    if (!data.event.allowSubscription) {
      return 'Inscrições indisponíveis.';
    }

    if (!this.isOnline()) {
      return 'Inscrições indisponíveis offline.';
    }

    if (!data.subscriptionSummary.hasAvailableSlots) {
      return 'Não há mais vagas.';
    }

    return 'Inscrições abertas.';
  }

  slotsLine(data: EventPageData): string | null {
    const availableSlots = data.subscriptionSummary.availableSlots;

    if (availableSlots == null) {
      return null;
    }

    return `${availableSlots} vaga${availableSlots === 1 ? '' : 's'} ${
      availableSlots === 1 ? 'disponível' : 'disponíveis'
    }`;
  }

  youtubeEmbedUrl(code: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(code)}`,
    );
  }

  private createEventState(): Observable<EventPageState> {
    return combineLatest([
      this.route.paramMap.pipe(map((params) => params.get('eventId') ?? params.get('eventID') ?? '')),
      toObservable(this.isAuthenticated),
      toObservable(this.reloadCounter),
    ]).pipe(
      switchMap(([eventId, authenticated]) => {
        if (!eventId) {
          return of({
            status: 'error',
            message: 'Página de evento inválida.',
          } satisfies EventPageState);
        }

        return this.api.getEventPageData(eventId, authenticated).pipe(
          map(
            (data): EventPageState => ({
              status: 'ready',
              data,
            }),
          ),
          startWith({ status: 'loading' } satisfies EventPageState),
          catchError((error: unknown) =>
            of({
              status: 'error',
              message: error instanceof Error ? error.message : 'Não foi possível carregar o evento.',
            } satisfies EventPageState),
          ),
        );
      }),
    );
  }

  private reload(): void {
    this.reloadCounter.update((value) => value + 1);
  }

  private showError(error: unknown): void {
    this.snackBar.open(error instanceof Error ? error.message : 'Não foi possível concluir.', 'OK', { duration: 5000 });
  }
}
