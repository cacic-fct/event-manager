import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors/routing';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import type { DetailViewModel } from '@cacic-fct/shared-utils';
import { EMPTY, catchError, combineLatest, expand, map, reduce, startWith, switchMap } from 'rxjs';
import { EventApiService } from '../detail/event-api.service';
import { MoreInfo } from '../../profile/attendance/more-info/more-info';
import { EventInformationFallbackService } from '../../shared/event-information-fallback.service';
import { resolveInternalReturnUrl } from '../../shared/internal-return-url';
import { NotFoundGraphqlError } from '../../shared/rate-limit-error';
import { routePageErrorStatus } from '../../shared/route-error-handling';
import { EventGroupInfo } from './event-group-info';

@Component({
  selector: 'app-event-group-info-page',
  imports: [EventGroupInfo, MoreInfo, MatProgressBarModule],
  template: `
    @let current = state();
    @if (current.status === 'ready') {
      <app-event-group-info
        [group]="current.group"
        [events]="current.events"
        [backUrl]="backUrl()"
        [participationStatuses]="participationStatuses()"
        [isAuthenticated]="isAuthenticated()"
        [hasParticipation]="hasParticipation()">
        @if (isAuthenticated()) {
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
      <mat-progress-bar mode="indeterminate" aria-label="Carregando grupo de eventos" />
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
  readonly hasParticipation = signal(false);
  readonly participationDetail = signal<DetailViewModel | null>(null);
  readonly participationStatuses = computed(() =>
    Object.fromEntries((this.participationDetail()?.events ?? []).map((item) => [item.event.id, item.statusLine])),
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
          expand((events, index) =>
            events.length === 100 ? this.api.listPublicEventGroupEvents(id, (index + 1) * 100) : EMPTY,
          ),
          reduce((all, page) => [...all, ...page], [] as PublicEvent[]),
          map((events) => {
            const group = events[0]?.eventGroup;
            if (!group || group.id !== id || group.majorEventId)
              throw new NotFoundGraphqlError('Grupo não encontrado.');
            return { group, events };
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
}
