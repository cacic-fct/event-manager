import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { firstValueFrom } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { ReceiptValidationApiService } from './receipt-validation-api.service';

describe('ReceiptValidationApiService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('watches the encoded receipt queue scope through the replayable EventSource helper', async () => {
    installFakeEventSource();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: GraphqlHttpService, useValue: {} }],
    });
    const service = TestBed.inject(ReceiptValidationApiService);
    const queue = firstValueFrom(service.watchQueue('major / 1'));
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.url).toBe('/api/major-event-receipts/admin/queue/events?majorEventId=major%20%2F%201');
    source.emitMessage({ type: 'receipt-validation-queue', queue: { pendingCount: 1, items: [] } });

    await expect(queue).resolves.toEqual({ pendingCount: 1, items: [] });
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('uses the unfiltered queue URL when no major event is selected', () => {
    installFakeEventSource();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: GraphqlHttpService, useValue: {} }],
    });

    const subscription = TestBed.inject(ReceiptValidationApiService).watchQueue().subscribe();
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.url).toBe('/api/major-event-receipts/admin/queue/events');

    subscription.unsubscribe();
    expect(source.close).toHaveBeenCalledOnce();
  });
});
