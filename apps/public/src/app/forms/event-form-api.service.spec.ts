import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { firstValueFrom } from 'rxjs';
import { PublicEventFormApiService } from './event-form-api.service';

describe('PublicEventFormApiService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('watches current-user results with all supported query parameters', async () => {
    installFakeEventSource();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const service = TestBed.inject(PublicEventFormApiService);
    const notification = firstValueFrom(
      service.watchCurrentUserResults({
        formId: 'form / 1',
        targetType: 'EVENT',
        eventId: 'event / 1',
        majorEventId: 'major / 1',
      }),
    );
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.url).toBe(
      '/api/event-forms/form%20%2F%201/current-user-results/events?targetType=EVENT&eventId=event+%2F+1&majorEventId=major+%2F+1',
    );
    source.emitMessage();

    await expect(notification).resolves.toBeUndefined();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('omits optional result scope parameters when they are empty', () => {
    installFakeEventSource();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });

    const subscription = TestBed.inject(PublicEventFormApiService)
      .watchCurrentUserResults({ formId: 'form-1', targetType: 'MAJOR_EVENT' })
      .subscribe();
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.url).toBe('/api/event-forms/form-1/current-user-results/events?targetType=MAJOR_EVENT');

    subscription.unsubscribe();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('sends the selected price-tier scope when loading subscription forms', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(PublicEventFormApiService);
    const http = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(
      service.listCurrentUserForms({
        targetType: 'MAJOR_EVENT',
        majorEventId: 'major-1',
        subscriptionFlowOnly: true,
        selectedPriceTierId: 'tier-student',
      }),
    );
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('selectedPriceTierId: $selectedPriceTierId');
    expect(request.request.body.query).toContain('priceTierIds');
    expect(request.request.body.variables).toEqual({
      targetType: 'MAJOR_EVENT',
      majorEventId: 'major-1',
      subscriptionFlowOnly: true,
      selectedPriceTierId: 'tier-student',
    });
    request.flush({ data: { currentUserEventForms: [] } });

    await expect(result).resolves.toEqual([]);
    http.verify();
  });
});
