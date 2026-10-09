import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject, throwError } from 'rxjs';
import { Permission } from '@cacic-fct/shared-permissions';
import { InterestTargetType } from '@cacic-fct/shared-event-participation';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import type { Event } from '@cacic-fct/event-manager-admin-contracts';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { InterestApiService } from '../graphql/interest-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { createAdminEvent, createAdminEventGroup, createAdminMajorEvent } from '../testing/admin-entity-fixtures';
import { flushAsync } from '../testing/async-test-helpers';
import { EventInterestsComponent } from './event-interests.component';

describe('EventInterestsComponent realtime refresh', () => {
  let workspaceEvents: Subject<void>;
  let eventEvents: Subject<void>;
  let api: { listInterests: ReturnType<typeof vi.fn>; convertInterestToSubscription: ReturnType<typeof vi.fn> };
  let realtime: {
    watchWorkspace: ReturnType<typeof vi.fn>;
    watchEventSubscriptions: ReturnType<typeof vi.fn>;
    watchMajorEventSubscriptions: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    workspaceEvents = new Subject<void>();
    eventEvents = new Subject<void>();
    api = {
      listInterests: vi.fn(() => of([interestFixture()])),
      convertInterestToSubscription: vi.fn(() => of({})),
    };
    realtime = {
      watchWorkspace: vi.fn(() => workspaceEvents),
      watchEventSubscriptions: vi.fn(() => eventEvents),
      watchMajorEventSubscriptions: vi.fn(() => of()),
    };

    await TestBed.configureTestingModule({
      imports: [EventInterestsComponent],
      providers: [
        {
          provide: EventApiService,
          useValue: {
            listEvents: vi.fn(() => of([eventFixture()])),
            getEvent: vi.fn(() => of({ ...eventFixture(), eventGroup: { requiresImageLicenseAgreement: true } })),
          },
        },
        { provide: EventGroupApiService, useValue: { listEventGroups: vi.fn(() => of([])), getEventGroup: vi.fn() } },
        { provide: MajorEventApiService, useValue: { listMajorEvents: vi.fn(() => of([])), getMajorEvent: vi.fn() } },
        { provide: InterestApiService, useValue: api },
        { provide: RealtimeApiService, useValue: realtime },
        { provide: PermissionsService, useValue: { has: vi.fn(() => true), evaluateWorkspacePermissions: vi.fn(async () => undefined) } },
        { provide: AdminFeedbackService, useValue: { error: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();
  });

  it('loads accessible events without requesting unreadable target types', async () => {
    vi.mocked(TestBed.inject(PermissionsService).has).mockImplementation((permission) => permission !== Permission.EventGroup.Read);
    const fixture = TestBed.createComponent(EventInterestsComponent);
    fixture.detectChanges();
    await flushAsync();
    expect(TestBed.inject(EventGroupApiService).listEventGroups).not.toHaveBeenCalled();
    expect(fixture.componentInstance.targets().map((target) => target.targetId)).toContain('event-1');
    expect(api.listInterests).toHaveBeenCalled();
  });

  it('keeps successful target types available if another request fails', async () => {
    vi.mocked(TestBed.inject(EventGroupApiService).listEventGroups).mockReturnValue(throwError(() => new Error('Forbidden')));
    const fixture = TestBed.createComponent(EventInterestsComponent);
    fixture.detectChanges();
    await flushAsync();
    expect(fixture.componentInstance.targets().map((target) => target.targetId)).toContain('event-1');
    expect(TestBed.inject(AdminFeedbackService).error).toHaveBeenCalled();
  });

  it('finds interested targets beyond the first 200 records', async () => {
    const listEvents = vi.mocked(TestBed.inject(EventApiService).listEvents);
    listEvents.mockReturnValueOnce(of(Array.from({ length: 200 }, (_, index) => ({
      ...eventFixture(), id: `old-${index}`, name: `Outro evento ${index}`, interestEnabled: false,
    })))).mockReturnValueOnce(of([eventFixture()]));
    const fixture = TestBed.createComponent(EventInterestsComponent);
    fixture.detectChanges();
    await flushAsync();
    expect(listEvents).toHaveBeenCalledWith({ skip: 200, take: 200 });
    fixture.componentInstance.targetQuery.set('Oficina');
    expect(fixture.componentInstance.filteredTargets().map((target) => target.targetId)).toEqual(['event-1']);
  });

  it.each([InterestTargetType.MAJOR_EVENT, InterestTargetType.EVENT_GROUP])(
    'excludes backing sports matches from %s conversion activities', async (targetType) => {
      vi.mocked(TestBed.inject(EventApiService).listEvents).mockReturnValue(of([
        eventFixture({ id: 'activity-1' }), eventFixture({ id: 'match-1', isSportsMatch: true }),
      ]));
      const fixture = TestBed.createComponent(EventInterestsComponent);
      fixture.detectChanges();
      await flushAsync();
      const component = fixture.componentInstance;
      await component.selectTarget({ targetType, targetId: 'target-1', name: 'Alvo', emoji: '📅', kindLabel: 'Alvo', interestEnabled: true });
      expect(component.targetEventIds()).toEqual(['activity-1']);
      expect(component.targetEvents().map(({ id }) => id)).toEqual(['activity-1']);

      vi.mocked(TestBed.inject(EventApiService).listEvents).mockReturnValue(of([
        eventFixture({ id: 'match-1', isSportsMatch: true }),
      ]));
      await component.selectTarget({ targetType, targetId: 'sports-only', name: 'Esportes', emoji: '⚽', kindLabel: 'Alvo', interestEnabled: true });
      expect(component.targetEventIds()).toEqual([]);
      expect(component.canConvertInterest(interestFixture())).toBe(false);
    },
  );

  it('keeps the selected target activities when target lookups resolve out of order', async () => {
    const eventApi = TestBed.inject(EventApiService);
    const listEvents = vi.mocked(eventApi.listEvents);
    const targetAEvents = [eventFixture({ id: 'event-a', name: 'Atividade A' })];
    const targetBEvents = [eventFixture({ id: 'event-b', name: 'Atividade B' })];
    const targetAResolution = new Subject<typeof targetAEvents>();
    const targetBResolution = new Subject<typeof targetBEvents>();
    let targetAResolutionCalls = 0;
    listEvents.mockImplementation((filters) => {
      if (filters?.majorEventId === 'major-a') {
        targetAResolutionCalls += 1;
        return targetAResolutionCalls === 1 ? of(targetAEvents) : targetAResolution;
      }
      if (filters?.majorEventId === 'major-b') {
        return targetBResolution;
      }
      return of([]);
    });
    vi.mocked(TestBed.inject(MajorEventApiService).listMajorEvents).mockReturnValue(of([
      createAdminMajorEvent({ id: 'major-a', name: 'Grande evento A', startDate: publicFixtureDateFromNow(1) }),
      createAdminMajorEvent({ id: 'major-b', name: 'Grande evento B', startDate: publicFixtureDateFromNow(2) }),
    ]));

    const fixture = TestBed.createComponent(EventInterestsComponent);
    fixture.detectChanges();
    await flushAsync();
    await flushAsync();

    const component = fixture.componentInstance;
    const targetA = component.targets().find((target) => target.targetId === 'major-a');
    const targetB = component.targets().find((target) => target.targetId === 'major-b');
    expect(targetA).toBeDefined();
    expect(targetB).toBeDefined();
    if (!targetA || !targetB) throw new Error('Expected major-event targets');

    const targetAPromise = component.selectTarget(targetA);
    const targetBPromise = component.selectTarget(targetB);
    targetBResolution.next(targetBEvents);
    targetBResolution.complete();
    await targetBPromise;
    targetAResolution.next(targetAEvents);
    targetAResolution.complete();
    await targetAPromise;

    expect(component.selectedTarget()?.targetId).toBe('major-b');
    expect(component.targetEventIds()).toEqual(['event-b']);
    expect(component.targetEvents()).toEqual([
      { id: 'event-b', name: 'Atividade B', startDate: targetBEvents[0].startDate },
    ]);
  });

  it.each([undefined, { imageLicenseAgreementAccepted: false }])('does not convert without required consent: %s', async (result) => {
    vi.mocked(TestBed.inject(MatDialog).open).mockReturnValue({ afterClosed: () => of(result) } as never);
    const fixture = TestBed.createComponent(EventInterestsComponent);
    fixture.detectChanges();
    await flushAsync();
    await fixture.componentInstance.convertInterest(interestFixture());
    expect(api.convertInterestToSubscription).not.toHaveBeenCalled();
    expect(fixture.componentInstance.convertingInterestId()).toBeNull();
  });

  it('forwards explicitly confirmed consent for a grouped event', async () => {
    vi.mocked(TestBed.inject(MatDialog).open).mockReturnValue({
      afterClosed: () => of({ imageLicenseAgreementAccepted: true }),
    } as never);
    const fixture = TestBed.createComponent(EventInterestsComponent);
    fixture.detectChanges();
    await flushAsync();
    await fixture.componentInstance.convertInterest(interestFixture());
    expect(TestBed.inject(MatDialog).open).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      data: expect.objectContaining({ requiresImageLicenseAgreement: true }),
    }));
    expect(api.convertInterestToSubscription).toHaveBeenCalledWith({
      interestId: 'interest-1', selectedEventIds: ['event-1'], imageLicenseAgreementAccepted: true,
    });
  });

  it('refreshes the current page on workspace and selected-event invalidations without resetting UI state', async () => {
    const fixture = TestBed.createComponent(EventInterestsComponent);
    fixture.detectChanges();
    await flushAsync();

    const component = fixture.componentInstance;
    component.interestsPagination.pageIndex.set(1);
    component.targetSearchForm.controls.query.setValue('Oficina');
    await flushAsync();
    const beforeRefresh = api.listInterests.mock.calls.length;

    workspaceEvents.next();
    await flushAsync();
    const afterWorkspaceRefresh = api.listInterests.mock.calls.length;
    eventEvents.next();
    await flushAsync();

    expect(api.listInterests.mock.calls.length).toBeGreaterThan(beforeRefresh);
    expect(api.listInterests.mock.calls.length).toBe(afterWorkspaceRefresh + 1);
    expect(component.interestsPagination.pageIndex()).toBe(1);
    expect(component.targetSearchForm.controls.query.value).toBe('Oficina');
    expect(realtime.watchWorkspace).toHaveBeenCalledOnce();
    expect(realtime.watchEventSubscriptions).toHaveBeenCalledWith('event-1');
  });

  it('keeps the selected history accessible after interest collection is disabled', async () => {
    const fixture = TestBed.createComponent(EventInterestsComponent);
    fixture.detectChanges();
    await flushAsync();
    vi.mocked(TestBed.inject(EventApiService).listEvents).mockReturnValue(of([
      { ...eventFixture(), interestEnabled: false },
    ]));
    await fixture.componentInstance.loadTargets();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedTarget()?.targetId).toBe('event-1');
    expect(fixture.componentInstance.interests()).toEqual([interestFixture()]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Novos interesses desativados');
  });

  it.each([InterestTargetType.EVENT, InterestTargetType.EVENT_GROUP])(
    'requires parent major-event consent when converting a %s interest', async (targetType) => {
      const majorEvent = createAdminMajorEvent({ id: 'major-1', requiresImageLicenseAgreement: true });
      vi.mocked(TestBed.inject(MajorEventApiService).getMajorEvent).mockReturnValue(of(majorEvent));
      vi.mocked(TestBed.inject(EventApiService).getEvent).mockReturnValue(of({
        ...eventFixture(), majorEventId: majorEvent.id, requiresImageLicenseAgreement: false,
      }));
      const group = createAdminEventGroup({ id: 'group-1', majorEventId: majorEvent.id, interestEnabled: true, requiresImageLicenseAgreement: false });
      vi.mocked(TestBed.inject(EventGroupApiService).getEventGroup).mockReturnValue(of(group));
      vi.mocked(TestBed.inject(EventGroupApiService).listEventGroups).mockReturnValue(of([group]));
      vi.mocked(TestBed.inject(MatDialog).open).mockReturnValue({
        afterClosed: () => of({ imageLicenseAgreementAccepted: true }),
      } as never);
      const fixture = TestBed.createComponent(EventInterestsComponent);
      fixture.detectChanges();
      await flushAsync();
      const target = fixture.componentInstance.targets().find((item) => item.targetType === targetType);
      expect(target).toBeDefined();
      if (!target) throw new Error('Expected interest target');
      await fixture.componentInstance.selectTarget(target);
      await fixture.componentInstance.convertInterest({ ...interestFixture(), targetType, targetId: target.targetId });
      expect(TestBed.inject(MajorEventApiService).getMajorEvent).toHaveBeenCalledWith('major-1');
      expect(TestBed.inject(MatDialog).open).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        data: expect.objectContaining({ requiresImageLicenseAgreement: true }),
      }));
      expect(api.convertInterestToSubscription).toHaveBeenCalledWith(expect.objectContaining({ imageLicenseAgreementAccepted: true }));
    },
  );
});

function eventFixture(overrides: Partial<Event> = {}) {
  return createAdminEvent({
    id: 'event-1',
    name: 'Oficina de Angular',
    emoji: '🧪',
    startDate: publicFixtureDateFromNow(1),
    endDate: publicFixtureDateFromNow(1, 14),
    interestEnabled: true,
    attendanceEligibility: null,
    ...overrides,
  });
}

function interestFixture() {
  return {
    id: 'interest-1',
    personId: 'person-1',
    person: { id: 'person-1', name: 'Ana Clara', email: 'ana@example.com' },
    targetType: InterestTargetType.EVENT,
    targetId: 'event-1',
    eventId: 'event-1',
    eventGroupId: null,
    majorEventId: null,
    createdAt: publicFixtureDateFromNow(-1),
    updatedAt: publicFixtureDateFromNow(-1),
  };
}
