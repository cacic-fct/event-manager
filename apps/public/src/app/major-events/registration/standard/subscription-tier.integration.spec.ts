import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { createPublicEvent, createPublicMajorEvent } from '@cacic-fct/event-manager-public-testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { NEVER, of } from 'rxjs';
import { AnalyticsService } from '../../../analytics/analytics.service';
import { MajorEventSubscriptionApiService } from '../subscription-api.service';
import { MajorEventSubscriptionRealtimeService } from '../realtime.service';
import { SubscriptionFormFlowService } from './subscription-form-flow.service';
import { MajorEventSubscription } from './subscription';

registerLocaleData(localePt);

const tiers = [
  { id: 'events', name: 'Eventos', value: 3000, includesEventRegistration: true, includesSportsRegistration: false },
  { id: 'sports', name: 'Esportes', value: 2000, includesEventRegistration: false, includesSportsRegistration: true },
  { id: 'both', name: 'Completa', value: 4000, includesEventRegistration: true, includesSportsRegistration: true },
  {
    id: 'neither',
    name: 'Participação',
    value: 0,
    includesEventRegistration: false,
    includesSportsRegistration: false,
  },
  {
    id: 'restricted',
    name: 'Lista autorizada',
    value: 3500,
    includesEventRegistration: true,
    includesSportsRegistration: false,
    restrictEventSelection: true,
    allowedEventIds: ['event'],
  },
  {
    id: 'empty',
    name: 'Sem eventos liberados',
    value: 1000,
    includesEventRegistration: true,
    includesSportsRegistration: false,
    restrictEventSelection: true,
    allowedEventIds: [],
  },
];

async function setup(
  existingTier: string | null = null,
  single = false,
  subscriptionStatus = 'WAITING_RECEIPT_UPLOAD',
  isPaymentRequired = true,
) {
  const majorEvent = createPublicMajorEvent({
    id: 'major',
    isPaymentRequired,
    requiresImageLicenseAgreement: false,
    majorEventPrices: [{ id: 'price', type: 'TIERED', tiers: single ? [tiers[0]] : tiers }],
  });
  const event = createPublicEvent({ id: 'event', majorEventId: 'major', autoSubscribe: false });
  const automatic = createPublicEvent({ id: 'automatic', majorEventId: 'major', autoSubscribe: true });
  const upsert = vi.fn(() => NEVER);
  const loadForms = vi.fn(() => of([]));
  const open = vi.fn(() => ({ afterClosed: () => of({ confirmed: true }) }));
  await TestBed.configureTestingModule({
    imports: [MajorEventSubscription],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ majorEventId: 'major' })),
          queryParamMap: of(convertToParamMap({})),
          snapshot: { paramMap: convertToParamMap({ majorEventId: 'major' }) },
          firstChild: null,
        },
      },
      { provide: AuthService, useValue: { isAuthenticated: signal(true), login: vi.fn() } },
      {
        provide: MajorEventSubscriptionApiService,
        useValue: {
          getSubscriptionPage: () => of({ majorEvent, events: [event, automatic], subscriptionSummaries: [] }),
          getCurrentUserSubscription: () =>
            of(
              existingTier
                ? {
                    paymentTier: existingTier,
                    subscriptionStatus,
                    selectedEvents: existingTier === 'Participação' ? [] : [event],
                  }
                : null,
            ),
          upsertSubscription: upsert,
        },
      },
      { provide: MajorEventSubscriptionRealtimeService, useValue: { watch: () => NEVER } },
      { provide: SubscriptionFormFlowService, useValue: { loadForms } },
      { provide: AnalyticsService, useValue: { trackMajorEventSubscription: vi.fn() } },
    ],
  })
    .overrideProvider(MatDialog, { useValue: { open } })
    .compileComponents();
  const fixture = TestBed.createComponent(MajorEventSubscription);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, component: fixture.componentInstance, upsert, loadForms, open, event };
}

describe('tier-first standard registration', () => {
  it('hides activity selection until the participant continues with a tier', async () => {
    const { fixture, component, event } = await setup();
    expect(fixture.nativeElement.querySelector('app-subscription-tier-selection')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-subscription-event-list')).toBeNull();
    component.continueFromTier();
    expect(component.showingTierStep()).toBe(true);
    component.selectPriceTier('Eventos');
    component.continueFromTier();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-subscription-event-list')).toBeTruthy();
    component.toggleEvent(event);
    expect(component.effectiveSelectedEventIds().has(event.id)).toBe(true);
    component.returnToTier();
    component.selectPriceTier('Esportes');
    expect(component.effectiveSelectedEventIds().size).toBe(0);
    expect(component.autoSelectedEventIds().size).toBe(0);
    expect(component.subscriptionFlowDraft()).toBeNull();
  });

  it.each(['Esportes', 'Participação'])(
    'reviews and submits %s without explicit or automatic events',
    async (tierName) => {
      const { component, upsert, loadForms, open } = await setup();
      component.selectPriceTier(tierName);
      component.continueFromTier();
      expect(loadForms).toHaveBeenCalledWith(expect.any(Array), tiers.find((tier) => tier.name === tierName)?.id);
      expect(open).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({ events: [], paymentTier: tierName }),
        }),
      );
      expect(upsert).toHaveBeenCalledWith('major', [], tierName, [], false);
    },
  );

  it('keeps a single tier visible for explicit confirmation before events', async () => {
    const { component, fixture } = await setup(null, true);
    expect(component.selectedPriceTierName()).toBe('Eventos');
    expect(component.showingTierStep()).toBe(true);
    expect(fixture.nativeElement.querySelector('app-subscription-event-list')).toBeNull();
  });

  it('ignores retained tier policies when payment is disabled on the major event', async () => {
    const { component } = await setup('Lista autorizada', false, 'WAITING_RECEIPT_UPLOAD', false);

    expect(component.selectedPriceTierName()).toBe('Lista autorizada');
    expect(component.sortedEvents().map((item) => item.id)).toEqual(['event', 'automatic']);
    expect(component.autoSelectedEventIds()).toEqual(new Set(['automatic']));
    expect(component.policyPriceTier()).toBeNull();
  });

  it('does not treat a confirmed participation-only tier as an editable sports subscription', async () => {
    const { component, upsert } = await setup('Participação', false, 'CONFIRMED');
    expect(component.confirmedSportsOnlySubscription()).toBe(false);
    component.flowPhase.set('selection');
    component.startSubscriptionFlow();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('removes newly unavailable automatic events and preserves selected events still allowed by the tier', async () => {
    const { component, event } = await setup();
    component.selectPriceTier('Eventos');
    component.continueFromTier();
    component.toggleEvent(event);

    expect(component.effectiveSelectedEventIds().has('automatic')).toBe(true);
    expect(component.effectiveSelectedEventIds().has(event.id)).toBe(true);

    component.selectPriceTier('Lista autorizada');

    expect(component.sortedEvents().map((item) => item.id)).toEqual(['event']);
    expect(component.autoSelectedEventIds()).toEqual(new Set());
    expect(component.effectiveSelectedEventIds()).toEqual(new Set(['event']));
  });

  it('keeps an event-enabled tier with an empty whitelist from submitting an invalid empty selection', async () => {
    const { component, upsert, loadForms, open } = await setup();
    component.selectPriceTier('Sem eventos liberados');
    component.continueFromTier();

    expect(component.sortedEvents()).toEqual([]);
    expect(component.autoSelectedEventIds()).toEqual(new Set());
    expect(component.requiresEventChoice()).toBe(true);
    expect(component.showingTierStep()).toBe(true);

    component.startSubscriptionFlow();
    expect(loadForms).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('hydrates an existing tier once without overwriting a later user choice', async () => {
    const { component, fixture } = await setup('Eventos');
    expect(component.selectedPriceTierName()).toBe('Eventos');
    component.selectPriceTier('Completa');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.selectedPriceTierName()).toBe('Completa');
  });
});
