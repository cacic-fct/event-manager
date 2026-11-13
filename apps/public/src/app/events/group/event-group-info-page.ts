import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { EventInformationNav } from '../../shared/event-information-nav';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors/routing';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import type { DetailViewModel } from '@cacic-fct/shared-utils';
import { EMPTY, catchError, combineLatest, expand, map, of, reduce, startWith, switchMap, timeout } from 'rxjs';
import { EventApiService } from '../detail/event-api.service';
import { MoreInfo } from '../../profile/attendance/more-info/more-info';
import {
  EVENT_INFORMATION_TIMEOUT_MS,
  EventInformationFallbackService,
} from '../../shared/event-information-fallback.service';
import { resolveInternalReturnUrl } from '../../shared/internal-return-url';
import { MajorEventParticipationSummary } from '../../shared/major-event-participation-summary';
import { NetworkStatusService } from '../../shared/network-status.service';
import { NotFoundGraphqlError } from '../../shared/rate-limit-error';
import { routePageErrorStatus } from '../../shared/route-error-handling';
import { EventGroupInfo } from './event-group-info';

@Component({
  selector: 'app-event-group-info-page',
  imports: [EventGroupInfo, MoreInfo, EventInformationNav, MajorEventParticipationSummary, MatButtonModule],
  template: `
    @let current = state();
    @if (current.status === 'ready') {
      <app-event-group-info
        [group]="current.group"
        [events]="programEvents()"
        [backUrl]="backUrl()"
        [parentMajorEventId]="parentMajorEventId()"
        [participationStatuses]="participationStatuses()"
        [participationPending]="participationPending()"
        [participationLoading]="
          participationPending() || !!workspace()?.loading() || majorParticipation().status === 'loading'
        "
        [isAuthenticated]="isAuthenticated()"
        [hasParticipation]="hasParticipation()">
        @if (parentMajorEventId()) {
          <ng-container participationWorkspace>
            @if (majorParticipation().status === 'loading') {
              <p role="status">Consultando sua participação…</p>
            } @else if (majorParticipation().status === 'error') {
              <section aria-label="Participação indisponível">
                <p role="status">Não foi possível consultar sua participação agora.</p>
                <button mat-button type="button" (click)="retryMajorParticipation()">Tentar novamente</button>
              </section>
            } @else if (majorParticipationCounts(); as counts) {
              <app-major-event-participation-summary [groupCounts]="counts" [majorEventName]="parentMajorEventName()" />
            }
          </ng-container>
        } @else if (showWorkspace()) {
          <app-more-info
            participationWorkspace
            [embedded]="true"
            targetType="event-group"
            [targetId]="current.group.id"
            [showEvents]="false"
            (detailLoaded)="participationDetail.set($event)"
            (participationChange)="hasParticipation.set($event)" />
        }
      </app-event-group-info>
    } @else {
      <app-event-information-nav title="Grupo de eventos" [backUrl]="backUrl()" [loading]="true" />
    }
  `,
})
export class EventGroupInfoPage {
  private readonly api = inject(EventApiService);
  private readonly fallback = inject(EventInformationFallbackService);
  private readonly route = inject(ActivatedRoute);
  private readonly routeErrors = inject(RouteErrorService);
  private readonly auth = inject(AuthService);
  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly isOnline = inject(NetworkStatusService).isOnline;
  readonly hasParticipation = signal(false);
  readonly participationDetail = signal<DetailViewModel | null>(null);
  protected readonly workspace = viewChild(MoreInfo);
  protected readonly showWorkspace = computed(() => this.isAuthenticated() || !this.isOnline());
  protected readonly participationPending = computed(
    () => !this.parentMajorEventId() && this.showWorkspace() && (this.workspace()?.initialDetailLoading() ?? true),
  );
  readonly backUrl = toSignal(
    this.route.queryParamMap.pipe(map((params) => resolveInternalReturnUrl(params.get('returnUrl'), '/calendar'))),
    { initialValue: '/calendar' },
  );
  readonly state = toSignal(
    combineLatest([this.route.paramMap, toObservable(this.isAuthenticated)]).pipe(
      switchMap(([params]) => {
        this.hasParticipation.set(false);
        this.participationDetail.set(null);
        const id = params.get('eventGroupId');
        if (!id) {
          void this.routeErrors.navigate(404);
          return EMPTY;
        }
        return this.api.listPublicEventGroupEvents(id).pipe(
          timeout({ first: EVENT_INFORMATION_TIMEOUT_MS }),
          expand((events) => {
            const last = events.at(-1);
            return last && events.length === 100
              ? this.api
                  .listPublicEventGroupEvents(id, { id: last.id, startDate: last.startDate })
                  .pipe(timeout({ first: EVENT_INFORMATION_TIMEOUT_MS }))
              : EMPTY;
          }),
          reduce((all, page) => [...all, ...page], [] as PublicEvent[]),
          map((events) => {
            const group = events[0]?.eventGroup;
            if (!group || group.id !== id) throw new NotFoundGraphqlError('Grupo não encontrado.');
            return { group, events: [...new Map(events.map((event) => [event.id, event])).values()] };
          }),
          catchError((error: unknown) => this.fallback.eventGroup(id, error)),
          map((data) => ({ status: 'ready' as const, ...data })),
          catchError((error: unknown) => {
            void this.routeErrors.navigate(routePageErrorStatus(error));
            return EMPTY;
          }),
          startWith({ status: 'loading' as const }),
        );
      }),
      takeUntilDestroyed(),
    ),
    { initialValue: { status: 'loading' as const } },
  );
  protected readonly parentMajorEventId = computed(() => {
    const state = this.state();
    return state.status === 'ready'
      ? (state.group.majorEventId ?? state.events.find((event) => event.majorEventId)?.majorEventId ?? null)
      : null;
  });
  protected readonly parentMajorEventName = computed(() => {
    const state = this.state();
    const parentId = this.parentMajorEventId();
    return state.status === 'ready' && parentId
      ? (state.events.find((event) => event.majorEvent?.id === parentId)?.majorEvent?.name ?? null)
      : null;
  });
  private readonly majorParticipationTarget = computed(() => {
    const state = this.state();
    const majorEventId = this.parentMajorEventId();
    return state.status === 'ready' && majorEventId && this.isAuthenticated() && this.isOnline()
      ? { majorEventId, group: state.group, events: state.events }
      : null;
  });
  private readonly majorParticipationRevision = signal(0);
  protected readonly majorParticipation = toSignal(
    combineLatest([toObservable(this.majorParticipationTarget), toObservable(this.majorParticipationRevision)]).pipe(
      switchMap(([target]) =>
        target
          ? this.api.getMajorEventGroupParticipation(target.majorEventId, target.group.id, target.events).pipe(
              timeout({ first: EVENT_INFORMATION_TIMEOUT_MS }),
              map((statuses) => ({ status: 'ready' as const, target, statuses })),
              catchError(() => of({ status: 'error' as const, target })),
              startWith({ status: 'loading' as const, target }),
            )
          : of({ status: 'idle' as const }),
      ),
    ),
    { initialValue: { status: 'idle' as const } },
  );
  private readonly majorParticipationStatuses = computed(() => {
    const participation = this.majorParticipation();
    return participation.status === 'ready' && participation.target === this.majorParticipationTarget()
      ? participation.statuses
      : {};
  });
  protected readonly majorParticipationCounts = computed(() => {
    const statuses = Object.values(this.majorParticipationStatuses());
    return statuses.length
      ? {
          subscribed: statuses.filter((status) => status.isSubscribed).length,
          attended: statuses.filter((status) => status.attendanceAt).length,
        }
      : null;
  });
  readonly participationStatuses = computed(() => {
    if (this.parentMajorEventId()) {
      return this.majorParticipationStatuses();
    }
    return Object.fromEntries((this.participationDetail()?.events ?? []).map((item) => [item.event.id, item]));
  });
  readonly programEvents = computed(() => {
    const state = this.state();
    if (state.status !== 'ready') return [];

    const events = new Map(state.events.map((event) => [event.id, event]));
    const detail = this.participationDetail();
    if (detail?.targetId === state.group.id && (this.isAuthenticated() || !this.isOnline())) {
      for (const { event } of detail.events) {
        if (!events.has(event.id)) events.set(event.id, event);
      }
    }
    return [...events.values()];
  });

  protected retryMajorParticipation() {
    this.majorParticipationRevision.update((revision) => revision + 1);
  }
}
