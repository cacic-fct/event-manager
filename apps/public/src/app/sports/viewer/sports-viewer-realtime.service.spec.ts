import { TestBed } from '@angular/core/testing';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { firstValueFrom } from 'rxjs';
import { SportsViewerRealtimeService } from './sports-viewer-realtime.service';

describe('SportsViewerRealtimeService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the replayable tournament stream with an encoded identifier', async () => {
    installFakeEventSource();
    const service = TestBed.inject(SportsViewerRealtimeService);
    const result = firstValueFrom(service.watchTournament('cup / 1'));
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.url).toBe('/api/sports/tournaments/cup%20%2F%201/events');
    source.emitMessage({ type: 'INVALIDATE', tournamentId: 'cup / 1' });

    await expect(result).resolves.toEqual({
      type: 'INVALIDATE',
      tournamentId: 'cup / 1',
    });
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('ignores malformed match messages and accepts projected score changes', async () => {
    installFakeEventSource();
    const service = TestBed.inject(SportsViewerRealtimeService);
    const values: unknown[] = [];
    const subscription = service.watchMatch('match-1').subscribe((value) => values.push(value));
    const source = FakeEventSource.instances[0] as FakeEventSource;

    source.emitMessage({ irrelevant: true });
    source.emitMessage({ matchId: 'match-1', state: 'LIVE', revision: 4 });

    expect(values).toEqual([{ matchId: 'match-1', state: 'LIVE', revision: 4 }]);
    subscription.unsubscribe();
  });

  it('ignores backend heartbeats instead of reloading the public view', () => {
    installFakeEventSource();
    const service = TestBed.inject(SportsViewerRealtimeService);
    const next = vi.fn();
    const subscription = service.watchMatch('match-1').subscribe(next);
    const source = FakeEventSource.instances[0] as FakeEventSource;

    source.emitMessage({ type: 'heartbeat' });
    expect(next).not.toHaveBeenCalled();

    subscription.unsubscribe();
  });
});
