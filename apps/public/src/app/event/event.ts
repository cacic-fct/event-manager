import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  PLATFORM_ID,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import type { PublicEvent, PublicLecturerProfile } from '@cacic-fct/event-manager-public-contracts';
import { AuthService, CloudflareTurnstileComponent, MailtoService } from '@cacic-fct/shared-angular';
import {
  TURNSTILE_ACTIONS,
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
import { EventLocationMap } from './components/event-location-map';
import { EventSubscriptionRealtimeService } from './event-subscription-realtime.service';
import { EmojiService } from '../shared/emoji.service';
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
    CloudflareTurnstileComponent,
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
  private readonly realtime = inject(EventSubscriptionRealtimeService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly mailto = inject(MailtoService);
  private readonly standaloneSubscriptionTurnstile = viewChild(CloudflareTurnstileComponent);

  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly emoji = inject(EmojiService);
  readonly isAuthenticated = this.authService.isAuthenticated;
  readonly isOnline = this.networkStatus.isOnline;
  readonly isSubscribing = signal(false);
  readonly isUnsubscribing = signal(false);
  readonly isConfirmingAttendance = signal(false);
  readonly standaloneSubscriptionTurnstileAction = TURNSTILE_ACTIONS.standaloneEventSubscription;
  readonly standaloneSubscriptionTurnstileToken = signal<string | null>(null);

  private readonly reloadCounter = signal(0);
  private readonly realtimeAvailability = signal<{ eventId: string; hasAvailableSlots: boolean } | null>(null);

  private readonly returnUrl = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('back') || params.get('returnUrl') || '/menu')),
    { initialValue: '/menu' },
  );

  readonly eventState = toSignal(this.createEventState(), {
    initialValue: { status: 'loading' } satisfies EventPageState,
  });

  readonly backUrl = computed(() => this.returnUrl());

  private readonly realtimeAvailabilityWatcher = effect((onCleanup) => {
    if (!this.isAuthenticated()) {
      return;
    }

    const currentState = this.eventState();
    if (currentState.status !== 'ready') {
      return;
    }

    const eventId = currentState.data.event.id;
    const subscription = this.realtime.watch(eventId).subscribe((availability) => {
      this.realtimeAvailability.set(availability);
    });

    onCleanup(() => subscription.unsubscribe());
  });

  private readonly turnstileResetWatcher = effect(() => {
    const currentState = this.eventState();
    if (currentState.status !== 'ready') {
      this.standaloneSubscriptionTurnstileToken.set(null);
      return;
    }

    this.standaloneSubscriptionTurnstileToken.set(null);
    this.standaloneSubscriptionTurnstile()?.reset();
  });

  goBack(): void {
    void this.router.navigateByUrl(this.backUrl());
  }

  async shareEvent(): Promise<void> {
    if (!this.isBrowser || !navigator.clipboard) {
      return;
    }
    const url = new URL(this.router.url, document.baseURI).toString().split('?')[0].split('#')[0];

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
      this.login();
      return;
    }

    if (!this.canSubscribe(data) || this.isSubscribing()) {
      return;
    }

    const turnstileToken = this.standaloneSubscriptionTurnstileToken();
    if (!turnstileToken) {
      this.snackBar.open('Conclua a verificação anti-spam.', 'OK', { duration: 3000 });
      return;
    }

    this.isSubscribing.set(true);

    this.api
      .subscribeToEvent(data.event.id, turnstileToken)
      .pipe(
        finalize(() => {
          this.isSubscribing.set(false);
          this.standaloneSubscriptionTurnstileToken.set(null);
          this.standaloneSubscriptionTurnstile()?.reset();
        }),
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

  unsubscribe(data: EventPageData): void {
    if (!this.isBrowser || !this.canUnsubscribe(data) || this.isUnsubscribing()) {
      return;
    }

    this.isUnsubscribing.set(true);

    this.api
      .unsubscribeFromEvent(data.event.id)
      .pipe(
        finalize(() => this.isUnsubscribing.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.snackBar.open('Inscrição cancelada.', 'OK', { duration: 3000 });
          this.reload();
        },
        error: (error: unknown) => this.showError(error),
      });
  }

  login(): void {
    if (!this.isBrowser) {
      return;
    }

    void this.authService.login({ returnTo: this.router.url });
  }

  confirmAttendance(data: EventPageData): void {
    if (!this.isBrowser) {
      return;
    }

    if (!this.isAuthenticated()) {
      this.login();
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
    if (!this.hasStandaloneSubscription(data.event)) {
      return false;
    }

    const now = Date.now();
    const event = data.event;
    const subscriptionStart = event.subscriptionStartDate ?? event.majorEvent?.subscriptionStartDate;
    const subscriptionEnd = event.subscriptionEndDate ?? event.majorEvent?.subscriptionEndDate;

    return (
      Boolean(event.allowSubscription) &&
      this.isOnline() &&
      !data.currentUserSubscription &&
      this.hasAvailableSlots(data) &&
      Date.parse(event.startDate) > now &&
      (!subscriptionStart || Date.parse(subscriptionStart) <= now) &&
      (!subscriptionEnd || Date.parse(subscriptionEnd) >= now)
    );
  }

  canUnsubscribe(data: EventPageData): boolean {
    return (
      this.hasStandaloneSubscription(data.event) &&
      Boolean(data.currentUserSubscription) &&
      this.isOnline() &&
      Date.parse(data.event.startDate) > Date.now()
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
    if (!event.shouldIssueCertificate || !event.creditMinutes) {
      return null;
    }

    const hours = Math.floor(event.creditMinutes / 60);
    const minutes = event.creditMinutes % 60;

    if (minutes === 0) {
      return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    }

    if (hours === 0) {
      return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
    }

    const hourLabel = hours === 1 ? 'hora' : 'horas';
    const minuteLabel = minutes === 1 ? 'minuto' : 'minutos';
    return `${hours} ${hourLabel} e ${minutes} ${minuteLabel}`;
  }

  subscriptionStatusLine(data: EventPageData): string {
    if (!this.hasStandaloneSubscription(data.event)) {
      return '';
    }

    if (data.currentUserSubscription) {
      return this.canUnsubscribe(data)
        ? 'Você pode cancelar sua inscrição até o início do evento.'
        : 'Inscrição confirmada.';
    }

    if (!data.event.allowSubscription) {
      return 'Inscrições indisponíveis.';
    }

    if (!this.isOnline()) {
      return 'Inscrições indisponíveis offline.';
    }

    if (!this.hasAvailableSlots(data)) {
      return 'Não há mais vagas.';
    }

    const now = Date.now();
    const subscriptionStart = data.event.subscriptionStartDate ?? data.event.majorEvent?.subscriptionStartDate;
    const subscriptionEnd = data.event.subscriptionEndDate ?? data.event.majorEvent?.subscriptionEndDate;

    if (Date.parse(data.event.startDate) <= now) {
      return 'O evento já começou.';
    }

    if (subscriptionStart && Date.parse(subscriptionStart) > now) {
      return 'Inscrições ainda não abertas.';
    }

    if (subscriptionEnd && Date.parse(subscriptionEnd) < now) {
      return 'Inscrições encerradas.';
    }

    return 'Inscrições abertas.';
  }

  youtubeEmbedUrl(code: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(code)}`,
    );
  }

  lecturerMailto(email: string): string {
    return this.mailto.compose({ to: email });
  }

  lecturerWhatsappUrl(lecturer: PublicLecturerProfile): string | null {
    if (!lecturer.whatsapp) {
      return null;
    }

    return `https://wa.me/${lecturer.whatsapp.replace(/\D/g, '')}`;
  }

  googlePictureUrl(url: string | null | undefined): string {
    return (url ?? '').replace(/([=/])s\d+(?=[-/=]|$)/, '$1s512');
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

  private hasAvailableSlots(data: EventPageData): boolean {
    const realtimeAvailability = this.realtimeAvailability();

    if (realtimeAvailability?.eventId === data.event.id) {
      return realtimeAvailability.hasAvailableSlots;
    }

    return data.subscriptionSummary.hasAvailableSlots;
  }

  hasStandaloneSubscription(event: PublicEvent): boolean {
    return Boolean(event.allowSubscription) && !event.majorEventId;
  }

  private showError(error: unknown): void {
    this.snackBar.open(error instanceof Error ? error.message : 'Não foi possível concluir.', 'OK', { duration: 5000 });
  }
}
