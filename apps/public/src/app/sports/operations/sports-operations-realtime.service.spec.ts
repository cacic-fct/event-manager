import { TestBed } from '@angular/core/testing';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { firstValueFrom } from 'rxjs';
import { SportsOperationsRealtimeService } from './sports-operations-realtime.service';

describe('SportsOperationsRealtimeService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('opens the authenticated stream and decodes reviewed application invalidations', async () => {
    installFakeEventSource();
    const service = TestBed.inject(SportsOperationsRealtimeService);
    const result = firstValueFrom(service.watchCurrentUserApplications());
    const source = FakeEventSource.instances[0] as FakeEventSource;
    const occurredAt = publicFixtureDateFromNow(0, 12);

    expect(source.url).toBe('/api/sports/applications/current/events');
    expect(source.init).toEqual({ withCredentials: true });
    source.emitMessage({
      type: 'SPORTS_PLAYER_APPLICATION_CHANGED',
      applicationId: 'application-1',
      tournamentId: 'tournament-1',
      reason: 'REVIEWED',
      status: 'APPROVED',
      paymentTier: 'Estudante',
      occurredAt,
    });

    await expect(result).resolves.toEqual({
      type: 'SPORTS_PLAYER_APPLICATION_CHANGED',
      applicationId: 'application-1',
      tournamentId: 'tournament-1',
      reason: 'REVIEWED',
      status: 'APPROVED',
      paymentTier: 'Estudante',
      occurredAt,
    });
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('decodes payment changes with the affected application projection', () => {
    installFakeEventSource();
    const service = TestBed.inject(SportsOperationsRealtimeService);
    const values: unknown[] = [];
    const subscription = service.watchCurrentUserApplications().subscribe((value) => values.push(value));
    const source = FakeEventSource.instances[0] as FakeEventSource;
    const occurredAt = publicFixtureDateFromNow(0, 12);

    source.emitMessage({
      type: 'SPORTS_PARTICIPANT_PAYMENT_CHANGED',
      tournamentId: 'tournament-1',
      subscriptionId: 'subscription-1',
      reason: 'PAYMENT_APPROVED',
      subscriptionStatus: 'CONFIRMED',
      participantStatus: 'ACTIVE',
      paymentStatus: 'PAID',
      applications: [{ id: 'application-1', status: 'ACTIVE' }],
      occurredAt,
    });

    expect(values).toEqual([
      {
        type: 'SPORTS_PARTICIPANT_PAYMENT_CHANGED',
        tournamentId: 'tournament-1',
        subscriptionId: 'subscription-1',
        reason: 'PAYMENT_APPROVED',
        subscriptionStatus: 'CONFIRMED',
        participantStatus: 'ACTIVE',
        paymentStatus: 'PAID',
        applications: [{ id: 'application-1', status: 'ACTIVE' }],
        occurredAt,
      },
    ]);
    subscription.unsubscribe();
  });

  it('ignores heartbeats, unknown types, malformed objects, and malformed JSON', () => {
    installFakeEventSource();
    const service = TestBed.inject(SportsOperationsRealtimeService);
    const next = vi.fn();
    const error = vi.fn();
    const subscription = service.watchCurrentUserApplications().subscribe({ next, error });
    const source = FakeEventSource.instances[0] as FakeEventSource;

    source.emitMessage({ type: 'heartbeat' });
    source.emitMessage({ type: 'UNKNOWN', tournamentId: 'tournament-1' });
    source.emitMessage({
      type: 'SPORTS_PLAYER_APPLICATION_CHANGED',
      applicationId: 'application-1',
      reason: 'REVIEWED',
    });
    source.emitMessage({
      type: 'SPORTS_PARTICIPANT_PAYMENT_CHANGED',
      tournamentId: 'tournament-1',
      subscriptionId: 'subscription-1',
      reason: 'PAYMENT_APPROVED',
      subscriptionStatus: 'CONFIRMED',
      participantStatus: 'ACTIVE',
      paymentStatus: 'PAID',
      applications: [{ id: 'application-1' }],
      occurredAt: publicFixtureDateFromNow(0, 12),
    });
    source.emitMessage('{not-json');

    expect(next).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('reports a terminal stream failure and closes the source when unsubscribed', () => {
    installFakeEventSource();
    const service = TestBed.inject(SportsOperationsRealtimeService);
    const error = vi.fn();
    const subscription = service.watchCurrentUserApplications().subscribe({ error });
    const source = FakeEventSource.instances[0] as FakeEventSource;

    source.readyState = FakeEventSource.CLOSED;
    source.emitError();

    expect(error).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'Não foi possível acompanhar sua inscrição esportiva em tempo real.' }),
    );
    subscription.unsubscribe();
    expect(source.close).toHaveBeenCalledOnce();
  });
});
