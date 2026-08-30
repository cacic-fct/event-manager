import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, inject } from '@angular/core';
import { watchRecoveringReplayableEventSourcePing } from '@cacic-fct/shared-angular';
import { EMPTY } from 'rxjs';
import type { Observable, ObservableInput } from 'rxjs';

@Service()
export class RealtimeApiService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  watchWorkspace(recover: () => ObservableInput<unknown>): Observable<void> {
    return this.watch('/api/realtime/admin/workspace/events', 'Não foi possível manter o painel atualizado.', recover);
  }

  watchEventSubscriptions(eventId: string, recover: () => ObservableInput<unknown>): Observable<void> {
    return this.watch(
      `/api/realtime/admin/events/${encodeURIComponent(eventId)}/subscriptions/events`,
      'Não foi possível acompanhar as inscrições do evento.',
      recover,
    );
  }

  watchMajorEventSubscriptions(majorEventId: string, recover: () => ObservableInput<unknown>): Observable<void> {
    return this.watch(
      `/api/realtime/admin/major-events/${encodeURIComponent(majorEventId)}/subscriptions/events`,
      'Não foi possível acompanhar as inscrições do grande evento.',
      recover,
    );
  }

  private watch(url: string, errorMessage: string, recover: () => ObservableInput<unknown>): Observable<void> {
    if (!this.isBrowser || typeof EventSource === 'undefined') return EMPTY;
    return watchRecoveringReplayableEventSourcePing(url, { errorMessage, recover });
  }
}
