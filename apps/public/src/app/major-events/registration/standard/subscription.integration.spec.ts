import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { EventFormTargetType, PublicEventForm } from '@cacic-fct/event-manager-public-contracts';
import { createPublicEvent, createPublicMajorEvent } from '@cacic-fct/event-manager-public-testing';
import { AuthService } from '@cacic-fct/shared-angular';
import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import { NEVER, Subject, of } from 'rxjs';
import { AnalyticsService } from '../../../analytics/analytics.service';
import { PublicEventFormApiService } from '../../../forms/event-form-api.service';
import { MajorEventSubscriptionApiService } from '../subscription-api.service';
import { MajorEventSubscriptionRealtimeService } from '../realtime.service';
import { createSubscriptionFlowFormFixtures } from './subscription-flow.fixtures';
import { createSubscriptionFlowDraft, subscriptionFormKey } from './subscription-flow.models';
import { SubscriptionReviewDialog, type SubscriptionReviewDialogData } from './subscription-review-dialog';
import { MajorEventSubscription } from './subscription';

registerLocaleData(localePt);

describe('MajorEventSubscription form flow integration', () => {
  it('loads target-ordered forms, reviews the draft, and submits answers with the selected events', async () => {
    const majorEvent = createPublicMajorEvent({
      id: 'major-1',
      name: 'SECOMPP',
      requiresImageLicenseAgreement: true,
      rankedSubscriptionEnabled: false,
      isPaymentRequired: false,
    });
    const event = createPublicEvent({
      id: 'event-1',
      name: 'Oficina de Angular',
      majorEventId: majorEvent.id,
      majorEvent,
      eventGroupId: null,
      eventGroup: null,
    });
    const forms = createSubscriptionFlowFormFixtures();
    const formsByTarget = new Map<string, PublicEventForm>([
      ['MAJOR_EVENT:major-1', forms[0].form],
      ['EVENT:event-1', forms[1].form],
    ]);
    const upsertResult = new Subject<CurrentUserMajorEventSubscription>();
    const upsertSubscription = vi.fn(() => upsertResult);
    const open = vi.fn(() => ({ afterClosed: () => of({ confirmed: true }) }));

    await TestBed.configureTestingModule({
      imports: [MajorEventSubscription],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ majorEventId: majorEvent.id })),
            queryParamMap: of(convertToParamMap({ requireImageLicenseAgreement: 'true' })),
            snapshot: {
              paramMap: convertToParamMap({ majorEventId: majorEvent.id }),
              queryParamMap: convertToParamMap({ requireImageLicenseAgreement: 'true' }),
            },
            firstChild: null,
          },
        },
        {
          provide: AuthService,
          useValue: { isAuthenticated: signal(true), login: vi.fn() },
        },
        {
          provide: MajorEventSubscriptionApiService,
          useValue: {
            getSubscriptionPage: () =>
              of({
                majorEvent,
                events: [event],
                subscriptionSummaries: [
                  {
                    eventId: event.id,
                    hasAvailableSlots: true,
                    availableSlots: 10,
                    projectedQueuePosition: 1,
                  },
                ],
              }),
            getCurrentUserSubscription: () =>
              of({
                id: 'subscription-1',
                majorEventId: majorEvent.id,
                subscriptionStatus: 'CONFIRMED',
                amountPaid: null,
                paymentDate: null,
                paymentTier: null,
                imageLicenseAgreementAccepted: false,
                majorEvent,
                selectedEvents: [event],
              }),
            upsertSubscription,
          },
        },
        {
          provide: PublicEventFormApiService,
          useValue: {
            listCurrentUserForms: (input: {
              targetType: EventFormTargetType;
              eventId?: string | null;
              majorEventId?: string | null;
            }) => {
              const targetId = input.targetType === 'EVENT' ? input.eventId : input.majorEventId;
              const form = formsByTarget.get(`${input.targetType}:${targetId}`);
              return of(form ? [form] : []);
            },
            getCurrentUserResponse: () => of(null),
          },
        },
        {
          provide: MajorEventSubscriptionRealtimeService,
          useValue: { watch: () => NEVER },
        },
        {
          provide: AnalyticsService,
          useValue: { trackMajorEventSubscription: vi.fn() },
        },
      ],
    });
    TestBed.overrideProvider(MatDialog, { useValue: { open } });
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(MajorEventSubscription);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;

    expect(component.flowPhase()).toBe('forms');
    expect(component.selectedEvents().map((item) => item.id)).toEqual([event.id]);
    expect(component.subscriptionForms().map((form) => form.form.name)).toEqual([
      'Camiseta do evento',
      'Preferências da atividade',
    ]);

    const loadedForms = component.subscriptionForms();
    const draft = createSubscriptionFlowDraft(loadedForms, true);
    draft.answersByKey[subscriptionFormKey(loadedForms[0])] = [
      { elementId: 'shirt-size', value: 'g' },
    ];
    draft.answersByKey[subscriptionFormKey(loadedForms[1])] = [
      { elementId: 'meal', value: 'no' },
    ];
    component.reviewSubscription(draft);
    component.reviewSubscription(draft);

    expect(open).toHaveBeenCalledWith(
      SubscriptionReviewDialog,
      expect.objectContaining({
        data: expect.objectContaining({
          events: [event],
          forms: loadedForms,
          draft,
        }) as Partial<SubscriptionReviewDialogData>,
      }),
    );
    expect(open).toHaveBeenCalledTimes(1);
    expect(upsertSubscription).toHaveBeenCalledWith(
      majorEvent.id,
      [event.id],
      null,
      [
        {
          formId: 'form-shirt',
          linkId: 'link-shirt',
          targetType: 'MAJOR_EVENT',
          majorEventId: majorEvent.id,
          answersJson: JSON.stringify([{ elementId: 'shirt-size', value: 'g' }]),
        },
        {
          formId: 'form-meal',
          linkId: 'link-meal',
          targetType: 'EVENT',
          eventId: event.id,
          answersJson: JSON.stringify([{ elementId: 'meal', value: 'no' }]),
        },
      ],
      true,
    );
    expect(upsertSubscription).toHaveBeenCalledTimes(1);
  });
});
