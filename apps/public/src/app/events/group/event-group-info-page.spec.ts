import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import {
  createParticipationInformationFixture,
  createPublicEvent,
  createPublicEventGroup,
} from '@cacic-fct/event-manager-public-testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { buildDetailViewModel } from '@cacic-fct/shared-utils';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors/routing';
import { of } from 'rxjs';
import { EventInformationFallbackService } from '../../shared/event-information-fallback.service';
import { NetworkStatusService } from '../../shared/network-status.service';
import { EventApiService } from '../detail/event-api.service';
import { EventGroupInfoPage } from './event-group-info-page';

it('loads the next group program page by cursor and shows rescheduled activities only once', () => {
  const group = createPublicEventGroup();
  const first = createPublicEvent({ id: 'event-000', eventGroup: group, eventGroupId: group.id });
  const rows = Array.from({ length: 100 }, (_, index) => ({
    ...first,
    id: `event-${String(index).padStart(3, '0')}`,
  }));
  const last = rows[99];
  const laterDate = new Date(Date.parse(last.startDate) + 86_400_000).toISOString();
  const rescheduled = { ...first, startDate: laterDate };
  const next = { ...rescheduled, id: 'event-100' };
  const listPublicEventGroupEvents = vi
    .fn()
    .mockReturnValueOnce(of(rows))
    .mockReturnValueOnce(of([rescheduled, next]));
  const authenticated = signal(true);
  TestBed.overrideComponent(EventGroupInfoPage, { set: { template: '', imports: [] } });
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ eventGroupId: group.id })),
          queryParamMap: of(convertToParamMap({})),
        },
      },
      { provide: AuthService, useValue: { isAuthenticated: authenticated } },
      { provide: NetworkStatusService, useValue: { isOnline: signal(true) } },
      { provide: RouteErrorService, useValue: {} },
      { provide: EventInformationFallbackService, useValue: {} },
      { provide: EventApiService, useValue: { listPublicEventGroupEvents } },
    ],
  });

  const fixture = TestBed.createComponent(EventGroupInfoPage);
  fixture.detectChanges();

  expect(listPublicEventGroupEvents.mock.calls).toEqual([
    [group.id],
    [group.id, { id: last.id, startDate: last.startDate }],
  ]);
  const state = fixture.componentInstance.state();
  expect(state).toMatchObject({ status: 'ready', group, events: [rescheduled, ...rows.slice(1), next] });

  const historical = { ...first, id: 'historical' };
  const participation = createParticipationInformationFixture({ targetType: 'event-group' });
  fixture.componentInstance.participationDetail.set(
    buildDetailViewModel({
      eventType: 'event-group',
      details: {
        eventGroup: group,
        subscription: null,
        events: [first, historical],
        attendances: participation.attendances,
        hasIssuedCertificate: true,
      },
    }),
  );

  expect(fixture.componentInstance.programEvents()).toEqual([rescheduled, ...rows.slice(1), next, historical]);
  expect(fixture.componentInstance.participationStatuses()[historical.id]).toBeTruthy();

  authenticated.set(false);
  expect(fixture.componentInstance.programEvents()).not.toContain(historical);
});
