import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { AuthService } from '@cacic-fct/shared-angular';
import { watchRecoveringReplayableEventSourcePing } from '@cacic-fct/shared-angular';
import { EMPTY, distinctUntilChanged, map, switchMap } from 'rxjs';
import type { Observable, ObservableInput } from 'rxjs';

@Service()
export class RealtimeInvalidationService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly auth = inject(AuthService);
  private readonly currentUserId = toObservable(this.auth.user).pipe(
    map((user) => user?.sub ?? null),
    distinctUntilChanged(),
  );

  watchCatalog(): Observable<void> {
    return this.watch('/api/realtime/public/catalog/events', 'Não foi possível atualizar os eventos ao vivo.');
  }

  watchCurrentUserData(): Observable<void> {
    return this.currentUserId.pipe(
      switchMap((userId) =>
        userId
          ? this.watch(
              '/api/realtime/current-user/data/events',
              'Não foi possível atualizar seus dados ao vivo.',
              () => this.auth.refreshMe(),
            )
          : EMPTY,
      ),
    );
  }

  watchOrganizer(
    targetType: string,
    targetId: string,
  ): Observable<void> {
    return this.currentUserId.pipe(
      switchMap((userId) =>
        userId
          ? this.watch(
              `/api/realtime/current-user/organizer/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}/events`,
              'Não foi possível atualizar os dados da organização ao vivo.',
              () => this.auth.refreshMe(),
            )
          : EMPTY,
      ),
    );
  }

  private watch(
    url: string,
    errorMessage: string,
    recover: () => ObservableInput<unknown> = () => Promise.resolve(),
  ): Observable<void> {
    if (!this.isBrowser || typeof EventSource === 'undefined') return EMPTY;
    return watchRecoveringReplayableEventSourcePing(url, { errorMessage, recover });
  }
}
