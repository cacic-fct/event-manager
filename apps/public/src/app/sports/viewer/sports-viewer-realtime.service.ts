import { Service } from '@angular/core';
import { watchReplayableEventSource } from '@cacic-fct/shared-angular';
import type { Observable } from 'rxjs';
import type { SportsViewerInvalidation } from './sports-viewer.types';

@Service()
export class SportsViewerRealtimeService {
  watchTournament(tournamentId: string): Observable<SportsViewerInvalidation> {
    return this.watch(
      `/api/sports/tournaments/${encodeURIComponent(tournamentId)}/events`,
      'Não foi possível manter o torneio atualizado em tempo real.',
    );
  }

  watchMatch(matchId: string): Observable<SportsViewerInvalidation> {
    return this.watch(
      `/api/sports/matches/${encodeURIComponent(matchId)}/events`,
      'Não foi possível manter a partida atualizada em tempo real.',
    );
  }

  private watch(url: string, errorMessage: string): Observable<SportsViewerInvalidation> {
    return watchReplayableEventSource(url, {
      decode: (event) => {
        const payload: unknown = JSON.parse(event.data);
        return isSportsViewerInvalidation(payload) ? payload : null;
      },
      errorMessage,
    });
  }
}

function isSportsViewerInvalidation(value: unknown): value is SportsViewerInvalidation {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const payload = value as Record<string, unknown>;
  if (payload['type'] === 'heartbeat') {
    return false;
  }
  return (
    (payload['type'] === undefined || typeof payload['type'] === 'string') &&
    (typeof payload['matchId'] === 'string' || typeof payload['tournamentId'] === 'string')
  );
}
