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
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type {
  EventFormTargetType,
  PublicEvent,
  PublicEventForm,
  PublicEventFormLink,
  PublicLecturerProfile,
  SubmitPublicEventFormResponseInput,
} from '@cacic-fct/event-manager-public-contracts';
import { AuthService, MailtoService, parseFormAnswersJson } from '@cacic-fct/shared-angular';
import {
  formatDateRange,
  getEventTypeLabel,
  isOnlineAttendanceRegistrationOpen,
} from '@cacic-fct/shared-utils';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { isAfter, isBefore, parseISO } from 'date-fns';
import { EMPTY, Observable, catchError, combineLatest, finalize, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { EventApiService, EventPageData } from './api.service';
import { EventLocationMap } from './location-map';
import { EventSubscriptionRealtimeService } from './subscription-realtime.service';
import { EmojiService } from '../../shared/emoji.service';
import { NetworkStatusService } from '../../shared/network-status.service';
import { RateLimitError, createRateLimitCooldown } from '../../shared/rate-limit-error';
import { PublicEventFormApiService } from '../../forms/event-form-api.service';
import { arePublicFormResultsReleased, isPublicFormLinkAvailable } from '../../forms/event-form-availability';
import {
  ConfirmSubscriptionDialog,
  type ConfirmSubscriptionDialogData,
  type ConfirmSubscriptionDialogResult,
  type SubscriptionFormAnswer,
  type SubscriptionFormContext,
} from '../../major-events/registration/standard/confirm-dialog';

type EventPageState =
  | { status: 'loading' }
  | { status: 'ready'; data: EventPageData }
  | { status: 'error'; message: string };

type EventFormPageLink = {
  formId: string;
  linkId: string | null;
  name: string;
  targetType: EventFormTargetType;
  targetId: string;
  targetName: string;
  mode: 'answer' | 'results';
  displayOrder: number;
};

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
    RouterLink,
  ],
  templateUrl: './event-page.html',
  styleUrl: './event-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Event {
  private readonly api = inject(EventApiService);
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formsApi = inject(PublicEventFormApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly snackBar = inject(MatSnackBar);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly realtime = inject(EventSubscriptionRealtimeService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly mailto = inject(MailtoService);
  private readonly standaloneSubscriptionCooldown = createRateLimitCooldown(this.destroyRef);

  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly emoji = inject(EmojiService);
  readonly isAuthenticated = this.authService.isAuthenticated;
  readonly isOnline = this.networkStatus.isOnline;
  readonly isSubscribing = signal(false);
  readonly isUnsubscribing = signal(false);
  readonly isConfirmingAttendance = signal(false);
  readonly standaloneSubscriptionCooldownSeconds = this.standaloneSubscriptionCooldown.seconds;

  private readonly reloadCounter = signal(0);
  private readonly realtimeAvailability = signal<{ eventId: string; hasAvailableSlots: boolean } | null>(null);
  private readonly cooldownEventId = signal<string | null>(null);

  private readonly returnUrl = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('back') || params.get('returnUrl') || '/menu')),
    { initialValue: '/menu' },
  );
  private readonly previewToken = toSignal(this.route.paramMap.pipe(map((params) => params.get('previewToken') ?? '')), {
    initialValue: '',
  });

  readonly eventState = toSignal(this.createEventState(), {
    initialValue: { status: 'loading' } satisfies EventPageState,
  });
  readonly attendeeFormLinks = toSignal(this.createAttendeeFormLinks(), {
    initialValue: [] satisfies EventFormPageLink[],
  });
  readonly isPreview = computed(() => Boolean(this.previewToken()));
  readonly calendarDownloadUrl = computed(() => {
    const currentState = this.eventState();
    if (currentState.status !== 'ready' || currentState.data.preview) {
      return null;
    }

    return `/api/calendar/events/${encodeURIComponent(currentState.data.event.id)}.ics`;
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

  private readonly cooldownResetWatcher = effect(() => {
    const currentState = this.eventState();
    if (currentState.status !== 'ready') {
      this.standaloneSubscriptionCooldown.clear();
      return;
    }

    const eventId = currentState.data.event.id;
    if (this.cooldownEventId() !== eventId) {
      this.cooldownEventId.set(eventId);
      this.standaloneSubscriptionCooldown.clear();
    }
  });

  goBack(): void {
    void this.router.navigateByUrl(this.backUrl());
  }

  async shareEvent(): Promise<void> {
    if (!this.isBrowser || !navigator.clipboard || this.isPreview()) {
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

    if (!this.canSubscribe(data) || this.isSubscribing() || this.standaloneSubscriptionCooldownSeconds() > 0) {
      return;
    }

    this.isSubscribing.set(true);

    this.loadSubscriptionForms(data)
      .pipe(
        switchMap((forms) => {
          if (forms.contexts.length === 0) {
            return this.api.subscribeToEvent(data.event.id);
          }

          return this.dialog
            .open<ConfirmSubscriptionDialog, ConfirmSubscriptionDialogData, ConfirmSubscriptionDialogResult>(
              ConfirmSubscriptionDialog,
              {
                data: {
                  event: data.event,
                  events: forms.events,
                  forms: forms.contexts,
                },
                width: 'min(720px, 96vw)',
                maxHeight: '90vh',
              },
            )
            .afterClosed()
            .pipe(
              switchMap((result) =>
                result?.confirmed
                  ? this.api.subscribeToEvent(data.event.id, this.toSubmitFormResponses(result.answers))
                  : EMPTY,
              ),
            );
        }),
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

  unsubscribe(data: EventPageData): void {
    if (
      !this.isBrowser ||
      !this.canUnsubscribe(data) ||
      this.isUnsubscribing() ||
      this.standaloneSubscriptionCooldownSeconds() > 0
    ) {
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

  formRoute(link: EventFormPageLink): string[] {
    return ['/profile', 'forms', link.formId];
  }

  formQueryParams(link: EventFormPageLink): { targetType: EventFormTargetType; targetId: string; linkId?: string } {
    return {
      targetType: link.targetType,
      targetId: link.targetId,
      ...(link.linkId ? { linkId: link.linkId } : {}),
    };
  }

  copyId(id: string): void {
    if (!this.isBrowser || !navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(id);

    this.snackBar.open('ID do evento copiado para a área de transferência.', 'OK', { duration: 3000 });
  }

  canSubscribe(data: EventPageData): boolean {
    if (data.preview) {
      return false;
    }

    if (!this.hasStandaloneSubscription(data.event)) {
      return false;
    }

    const now = new Date();
    const event = data.event;
    const subscriptionStart = event.subscriptionStartDate ?? event.majorEvent?.subscriptionStartDate;
    const subscriptionEnd = event.subscriptionEndDate ?? event.majorEvent?.subscriptionEndDate;

    return (
      Boolean(event.allowSubscription) &&
      this.isOnline() &&
      !data.currentUserSubscription &&
      this.hasAvailableSlots(data) &&
      isAfter(parseISO(event.startDate), now) &&
      (!subscriptionStart || !isAfter(parseISO(subscriptionStart), now)) &&
      (!subscriptionEnd || !isBefore(parseISO(subscriptionEnd), now))
    );
  }

  canUnsubscribe(data: EventPageData): boolean {
    return (
      !data.preview &&
      this.hasStandaloneSubscription(data.event) &&
      Boolean(data.currentUserSubscription) &&
      this.isOnline() &&
      isAfter(parseISO(data.event.startDate), new Date())
    );
  }

  canConfirmAttendance(event: PublicEvent): boolean {
    if (this.isPreview()) {
      return false;
    }

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

    if (data.preview) {
      return 'Pré-visualização: inscrições ficam desativadas neste link.';
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

    const now = new Date();
    const subscriptionStart = data.event.subscriptionStartDate ?? data.event.majorEvent?.subscriptionStartDate;
    const subscriptionEnd = data.event.subscriptionEndDate ?? data.event.majorEvent?.subscriptionEndDate;

    if (!isAfter(parseISO(data.event.startDate), now)) {
      return 'O evento já começou.';
    }

    if (subscriptionStart && isAfter(parseISO(subscriptionStart), now)) {
      return 'Inscrições ainda não abertas.';
    }

    if (subscriptionEnd && isBefore(parseISO(subscriptionEnd), now)) {
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
      this.route.paramMap.pipe(
        map((params) => ({
          eventId: params.get('eventId') ?? params.get('eventID') ?? '',
          previewToken: params.get('previewToken') ?? '',
        })),
      ),
      toObservable(this.isAuthenticated),
      toObservable(this.reloadCounter),
    ]).pipe(
      switchMap(([routeParams, authenticated]) => {
        if (routeParams.previewToken) {
          return this.api.getPreviewEventPageData(routeParams.previewToken).pipe(
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
                message: error instanceof Error ? error.message : 'Não foi possível carregar a pré-visualização.',
              } satisfies EventPageState),
            ),
          );
        }

        const eventId = routeParams.eventId;
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

  private createAttendeeFormLinks(): Observable<EventFormPageLink[]> {
    return combineLatest([toObservable(this.eventState), toObservable(this.isAuthenticated), toObservable(this.isOnline)]).pipe(
      switchMap(([currentState, authenticated, online]) => {
        if (currentState.status !== 'ready' || !authenticated || !online || currentState.data.preview) {
          return of([]);
        }

        if (!currentState.data.currentUserAttendance) {
          return of([]);
        }

        return this.loadAttendeeFormLinks(currentState.data);
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

  private loadAttendeeFormLinks(data: EventPageData): Observable<EventFormPageLink[]> {
    const target = {
      targetType: 'EVENT' as const,
      targetId: data.event.id,
      targetName: data.event.name,
    };

    return this.formsApi
      .listCurrentUserForms({
        targetType: target.targetType,
        eventId: target.targetId,
        majorEventId: null,
      })
      .pipe(
        map((forms) => {
          const seen = new Set<string>();
          return forms
            .flatMap((form) => this.toEventFormPageLinks(form, target))
            .filter((link) => {
              const key = `${link.formId}:${link.linkId ?? 'sem-vinculo'}:${link.targetType}:${link.targetId}`;
              if (seen.has(key)) {
                return false;
              }
              seen.add(key);
              return true;
            })
            .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name));
        }),
        catchError(() => of([])),
      );
  }

  private toEventFormPageLinks(
    form: PublicEventForm,
    target: { targetType: EventFormTargetType; targetId: string; targetName: string },
  ): EventFormPageLink[] {
    return form.links.flatMap((link) => {
      if (
        link.targetType !== target.targetType ||
        (link.eventId ?? null) !== target.targetId ||
        link.majorEventId != null
      ) {
        return [];
      }

      const canAnswer = isPublicFormLinkAvailable(link);
      const resultsReleased = arePublicFormResultsReleased(form, link);
      if (!canAnswer && !resultsReleased) {
        return [];
      }

      return [
        {
          formId: form.id,
          linkId: link.id,
          name: form.name,
          targetType: target.targetType,
          targetId: target.targetId,
          targetName: target.targetName,
          mode: !canAnswer && resultsReleased ? 'results' : 'answer',
          displayOrder: link.displayOrder ?? Number.MAX_SAFE_INTEGER,
        },
      ];
    });
  }

  private loadSubscriptionForms(data: EventPageData) {
    return this.loadSubscriptionTargets(data).pipe(
      switchMap((targets) =>
        forkJoin(
          targets.map((target) =>
            this.formsApi
              .listCurrentUserForms({
                targetType: target.targetType,
                eventId: target.targetId,
                majorEventId: null,
                subscriptionFlowOnly: true,
              })
              .pipe(map((forms) => forms.flatMap((form) => this.toSubscriptionFormContexts(form, target)))),
          ),
        ).pipe(map((contexts) => ({ events: targets.map((target) => target.event), contexts: contexts.flat() }))),
      ),
      map(({ events, contexts }) => {
        const seen = new Set<string>();
        return {
          events,
          contexts: contexts
            .filter((form) => {
              const key = `${form.form.id}:${form.linkId ?? 'sem-vinculo'}:${form.targetType}:${form.targetId}`;
              if (seen.has(key)) {
                return false;
              }
              seen.add(key);
              return true;
            })
            .sort((left, right) => this.formDisplayOrder(left) - this.formDisplayOrder(right)),
        };
      }),
      switchMap(({ events, contexts }) =>
        contexts.length > 0
          ? forkJoin(contexts.map((form) => this.loadExistingFormAnswer(form))).pipe(
              map((loadedContexts) => ({ events, contexts: loadedContexts })),
            )
          : of({ events, contexts: [] satisfies SubscriptionFormContext[] }),
      ),
    );
  }

  private loadSubscriptionTargets(data: EventPageData) {
    const currentEventTarget = {
      targetType: 'EVENT' as const,
      targetId: data.event.id,
      targetName: data.event.name,
      event: data.event,
    };

    if (!data.event.eventGroupId) {
      return of([currentEventTarget]);
    }

    return this.api.listPublicEventGroupEvents(data.event.eventGroupId).pipe(
      map((events) => {
        const eligibleEvents = events.filter((event) => this.hasStandaloneSubscription(event));
        const targets = eligibleEvents.length > 0 ? eligibleEvents : [data.event];
        return targets.map((event) => ({
          targetType: 'EVENT' as const,
          targetId: event.id,
          targetName: event.name,
          event,
        }));
      }),
    );
  }

  private toSubscriptionFormContexts(
    form: PublicEventForm,
    target: { targetType: EventFormTargetType; targetId: string; targetName: string },
  ): SubscriptionFormContext[] {
    const links = form.links.filter((item) => this.isEligibleSubscriptionFlowLink(item, target));
    const matchingLinks = links.length > 0 ? links : [null];

    return matchingLinks.map((link) => ({
      form,
      targetType: target.targetType,
      targetId: target.targetId,
      targetName: target.targetName,
      linkId: link?.id ?? null,
      requiredInSubscriptionFlow: link?.requiredInSubscriptionFlow ?? false,
      enforceRequiredAnswers: link?.enforceRequiredAnswers ?? true,
      initialAnswers: [],
      submitted: false,
      editable: true,
    }));
  }

  private loadExistingFormAnswer(form: SubscriptionFormContext) {
    return this.formsApi
      .getCurrentUserResponse({
        formId: form.form.id,
        linkId: form.linkId,
        targetType: form.targetType,
        eventId: form.targetId,
        majorEventId: null,
      })
      .pipe(
        map((response) => ({
          ...form,
          initialAnswers: parseFormAnswersJson(response?.answersJson),
          submitted: Boolean(response),
          editable: !response || form.form.responseMode === 'MULTIPLE_PER_TARGET' || form.form.allowResponseEdits,
        })),
      );
  }

  private formDisplayOrder(form: SubscriptionFormContext): number {
    return form.form.links.find((link) => link.id === form.linkId)?.displayOrder ?? Number.MAX_SAFE_INTEGER;
  }

  private isEligibleSubscriptionFlowLink(
    link: PublicEventFormLink,
    target: { targetType: EventFormTargetType; targetId: string },
  ): boolean {
    if (
      !link.insertInSubscriptionFlow ||
      link.targetType !== target.targetType ||
      (link.eventId ?? null) !== target.targetId ||
      link.majorEventId != null
    ) {
      return false;
    }

    const now = Date.now();
    const availableFrom = link.availableFrom ? Date.parse(link.availableFrom) : null;
    const availableUntil = link.availableUntil ? Date.parse(link.availableUntil) : null;
    return (
      (availableFrom === null || Number.isNaN(availableFrom) || availableFrom <= now) &&
      (availableUntil === null || Number.isNaN(availableUntil) || availableUntil > now)
    );
  }

  private toSubmitFormResponses(formAnswers: SubscriptionFormAnswer[]): SubmitPublicEventFormResponseInput[] {
    return formAnswers.map((answer) => ({
      formId: answer.formId,
      linkId: answer.linkId,
      targetType: 'EVENT',
      eventId: answer.targetId,
      answersJson: JSON.stringify(answer.answers),
    }));
  }

  private showError(error: unknown): void {
    if (error instanceof RateLimitError) {
      this.standaloneSubscriptionCooldown.start(error.retryAfterSeconds);
    }
    this.snackBar.open(error instanceof Error ? error.message : 'Não foi possível concluir.', 'OK', { duration: 5000 });
  }
}
