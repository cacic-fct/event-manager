import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, inject } from '@angular/core';
import { watchRecoveringReplayableEventSourcePing } from '@cacic-fct/shared-angular';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { EMPTY } from 'rxjs';
import type { Observable } from 'rxjs';

@Service()
export class RealtimeApiService {
  private readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  watchWorkspace(): Observable<void> {
    return this.watch('/api/realtime/admin/workspace/events', 'Não foi possível manter o painel atualizado.');
  }

  watchEventSubscriptions(eventId: string): Observable<void> {
    return this.watch(
      `/api/realtime/admin/events/${encodeURIComponent(eventId)}/subscriptions/events`,
      'Não foi possível acompanhar as inscrições do evento.',
    );
  }

  watchMajorEventSubscriptions(majorEventId: string): Observable<void> {
    return this.watch(
      `/api/realtime/admin/major-events/${encodeURIComponent(majorEventId)}/subscriptions/events`,
      'Não foi possível acompanhar as inscrições do grande evento.',
    );
  }

  private watch(url: string, errorMessage: string): Observable<void> {
    if (!this.isBrowser || typeof EventSource === 'undefined') return EMPTY;
    return watchRecoveringReplayableEventSourcePing(url, {
      errorMessage,
      recover: () => this.auth.refreshMe(),
    });
  }
}
