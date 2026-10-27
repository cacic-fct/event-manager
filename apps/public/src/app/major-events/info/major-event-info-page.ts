import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors/routing';
import type { PublicEvent, PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import type { CurrentUserMajorEventSubscription, DetailViewModel } from '@cacic-fct/shared-utils';
import {
  EMPTY,
  Subject,
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
  takeUntil,
  timer,
} from 'rxjs';
import { MoreInfo } from '../../profile/attendance/more-info/more-info';
import { EventInformationFallbackService } from '../../shared/event-information-fallback.service';
import { resolveInternalReturnUrl } from '../../shared/internal-return-url';
import { routePageErrorStatus } from '../../shared/route-error-handling';
import { MajorEventSubscriptionApiService } from '../registration/subscription-api.service';
import { MajorEventInfo, type MajorEventInfoRegistration } from './major-event-info';
import { MAJOR_EVENT_PROGRAM_PAGE_SIZE, MajorEventInfoApiService } from './major-event-info-api.service';
import { majorEventInfoLinks, majorEventRegistrationInfo } from './major-event-info-policy';

type SubscriptionState =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; subscription: CurrentUserMajorEventSubscription | null };

@Component({
  selector: 'app-major-event-info-page',
  imports: [MajorEventInfo, MoreInfo, MatProgressBarModule],
  template: `
    @if (majorEvent(); as event) {
      <app-major-event-info
        [majorEvent]="event"
        [events]="events()"
        [registration]="registration()"
        [links]="links()"
        [programLoading]="programLoading()"
        [programError]="programError()"
        [programHasMore]="programHasMore()"
        [now]="currentTime()"
        [backUrl]="backUrl()"
        [hasParticipation]="hasParticipation()"
        [hasSubscription]="hasSubscription()"
        (loginRequested)="login()"
        (retryProgram)="loadProgram()"
        (loadMoreProgram)="loadProgram()">
        @if (isAuthenticated()) {
          <app-more-info
            participationWorkspace
            [embedded]="true"
            [flatSections]="hasSubscription()"
            targetType="major-event"
            [targetId]="event.id"
            (participationChange)="hasParticipation.set($event)"
            (detailLoaded)="participationDetail.set($event)" />
        }
      </app-major-event-info>
    } @else {
      <mat-progress-bar mode="indeterminate" aria-label="Carregando informações do evento" />
      <p role="status">Carregando informações do evento...</p>
    }
  `,
})
export class MajorEventInfoPage {
  private readonly api = inject(MajorEventInfoApiService);
  private readonly informationFallback = inject(EventInformationFallbackService);
  private readonly subscriptionsApi = inject(MajorEventSubscriptionApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly routeErrors = inject(RouteErrorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly currentTime = toSignal(
    this.browser ? timer(0, 30_000).pipe(map(() => Date.now())) : of(Date.now()),
    { initialValue: Date.now() },
  );
  private readonly subscriptionState = signal<SubscriptionState>({ status: 'loading' });
  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly hasParticipation = signal(false);
  readonly participationDetail = signal<DetailViewModel | null>(null);
  readonly hasSubscription = computed(() => {
    if (!this.isAuthenticated()) return false;
    const state = this.subscriptionState();
    if (state.status === 'ready') {
      return Boolean(state.subscription && state.subscription.subscriptionStatus !== 'CANCELED');
    }
    const detail = this.participationDetail();
    return Boolean(detail?.isSubscribed && detail.subscriptionStatus !== 'CANCELED');
  });
  readonly backUrl = toSignal(
    this.route.queryParamMap.pipe(map((params) => resolveInternalReturnUrl(params.get('returnUrl'), '/major-event'))),
    { initialValue: '/major-event' },
  );
  private readonly programRequests = new Subject<void>();
  private readonly programReset = new Subject<void>();
  private programOffset = 0;

  readonly majorEvent = signal<PublicMajorEvent | null>(null);
  readonly events = signal<PublicEvent[]>([]);
  readonly programLoading = signal(false);
  readonly programError = signal(false);
  readonly programHasMore = signal(false);
  readonly links = computed(() => {
    const event = this.majorEvent();
    return event ? majorEventInfoLinks(event) : [];
  });
  readonly registration = computed<MajorEventInfoRegistration>(() => {
    const event = this.majorEvent();
    if (!event) {
      return { title: 'Participação' };
    }
    const authenticated = this.auth.isAuthenticated();
    const state = this.subscriptionState();
    if (authenticated && state.status === 'loading') {
      return { title: 'Consultando sua inscrição...' };
    }
    if (authenticated && state.status === 'error') {
      return {
        title: 'Sua inscrição',
        description: 'Não foi possível consultar sua inscrição agora.',
        action: { label: 'Ver minhas participações', route: ['/profile', 'attendances'] },
      };
    }
    return majorEventRegistrationInfo(
      event,
      authenticated,
      state.status === 'ready' ? state.subscription : null,
      this.currentTime(),
    );
  });

  constructor() {
    if (!this.browser) {
      return;
    }

    this.programRequests
      .pipe(
        switchMap(() => {
          const event = this.majorEvent();
          if (!event) {
            return EMPTY;
          }
          this.programLoading.set(true);
          this.programError.set(false);
          return this.api.getProgram(event.id, this.programOffset).pipe(
            takeUntil(this.programReset),
            catchError(() => {
              this.programError.set(true);
              this.programLoading.set(false);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((events) => {
        this.programOffset += events.length;
        this.events.update((current) => [
          ...new Map([...current, ...events].map((event) => [event.id, event])).values(),
        ]);
        this.programHasMore.set(events.length === MAJOR_EVENT_PROGRAM_PAGE_SIZE);
        this.programLoading.set(false);
      });

    this.route.paramMap
      .pipe(
        map((params) => params.get('majorEventId')),
        distinctUntilChanged(),
        switchMap((id) => {
          this.programReset.next();
          this.programLoading.set(false);
          this.programError.set(false);
          this.majorEvent.set(null);
          this.hasParticipation.set(false);
          this.participationDetail.set(null);
          this.events.set([]);
          this.programOffset = 0;
          this.programHasMore.set(false);
          this.subscriptionState.set({ status: 'loading' });
          if (!id) {
            void this.routeErrors.navigate(404);
            return EMPTY;
          }
          return this.api.getMajorEvent(id).pipe(
            catchError((error: unknown) =>
              this.informationFallback.majorEvent(id, error).pipe(
                map(({ event, details }) => {
                  this.events.set(details.subscription?.selectedEvents ?? details.events ?? []);
                  return event;
                }),
              ),
            ),
            catchError((error: unknown) => {
              void this.routeErrors.navigate(routePageErrorStatus(error));
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.majorEvent.set(event);
        this.loadProgram();
      });

    combineLatest([toObservable(this.majorEvent), toObservable(this.auth.isAuthenticated)])
      .pipe(
        switchMap(([event, authenticated]) => {
          if (!event || !authenticated) {
            return of<SubscriptionState>({ status: 'ready', subscription: null });
          }
          return this.subscriptionsApi.getCurrentUserSubscription(event.id).pipe(
            map((subscription): SubscriptionState => ({ status: 'ready', subscription })),
            catchError(() => of<SubscriptionState>({ status: 'error' })),
            startWith<SubscriptionState>({ status: 'loading' }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this.subscriptionState.set(state));
  }

  loadProgram(): void {
    if (!this.programLoading()) {
      this.programRequests.next();
    }
  }

  login(): void {
    const event = this.majorEvent();
    if (event) {
      void this.auth.login({ returnTo: `/major-event/${event.id}` });
    }
  }
}
