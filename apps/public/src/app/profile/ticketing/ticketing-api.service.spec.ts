import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { TicketRealtimeInvalidation, TicketTransfer } from '@cacic-fct/shared-ticketing';
import { firstValueFrom } from 'rxjs';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { TicketingApiService } from './ticketing-api.service';

describe('TicketingApiService', () => {
  let service: TicketingApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    service = TestBed.inject(TicketingApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
  });

  it('loads owned tickets and selects only wallet-safe fields', async () => {
    const result = firstValueFrom(service.myWalletTickets());
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('myWalletTickets');
    expect(request.request.body.query).toContain('transferEligibilityDescription');
    expect(request.request.body.query).toContain('aztecPayload');
    expect(request.request.body.query).toContain('locationDescription');
    expect(request.request.body.query).toContain('type');
    request.flush({ data: { myWalletTickets: [] } });
    await expect(result).resolves.toEqual([]);
  });

  it('sends identity documents only to the start mutation and keeps the response author-safe', async () => {
    const transfer = { id: 'transfer-1', submittedDestinationIdentityDocument: '52998224725' } as TicketTransfer;
    const result = firstValueFrom(service.startTicketTransfer('ticket-1', '52998224725'));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('startTicketTransfer');
    expect(request.request.body.variables).toEqual({
      ticketId: 'ticket-1',
      destinationIdentityDocument: '52998224725',
    });
    request.flush({ data: { startTicketTransfer: transfer } });
    await expect(result).resolves.toEqual(transfer);
  });

  it('receives replayable ticket invalidations from the default SSE message event', () => {
    installFakeEventSource();
    let received: TicketRealtimeInvalidation | null = null;
    const subscription = service.watchCurrentUser().subscribe((value) => (received = value));
    const source = FakeEventSource.instances[0] as FakeEventSource;
    const invalidation: TicketRealtimeInvalidation = {
      revision: '17',
      type: 'TRANSFERS_CHANGED',
      transferId: 'transfer-1',
      changedAt: new Date().toISOString(),
    };

    source.emitMessage(JSON.stringify(invalidation));

    expect(received).toEqual(invalidation);
    subscription.unsubscribe();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('recovers from stream closure with an authenticated snapshot and invalidates ticket views', async () => {
    installFakeEventSource();
    const received: TicketRealtimeInvalidation[] = [];
    const subscription = service.watchCurrentUser().subscribe((value) => received.push(value));
    const firstSource = FakeEventSource.instances[0] as FakeEventSource;
    firstSource.readyState = FakeEventSource.CLOSED;
    firstSource.emitError();

    const recoveryRequest = http.expectOne('/api/graphql');
    expect(recoveryRequest.request.body.query).toContain('TicketRealtimeRecoverySnapshot');
    recoveryRequest.flush({
      data: {
        myWalletTickets: [],
        myTicketTransfers: { incomingPending: [], incomingIgnored: [], outgoing: [] },
      },
    });

    await vi.waitFor(
      () => {
        expect(received.map((event) => event.type)).toEqual([
          'TICKETS_CHANGED',
          'TRANSFERS_CHANGED',
          'PURCHASES_CHANGED',
        ]);
        expect(FakeEventSource.instances.length).toBeGreaterThan(1);
      },
      { timeout: 3000 },
    );
    subscription.unsubscribe();
  });
});
