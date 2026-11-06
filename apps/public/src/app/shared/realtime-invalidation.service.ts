import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { watchRecoveringReplayableEventSourcePing } from '@cacic-fct/shared-angular/realtime';
import { EMPTY, distinctUntilChanged, fromEvent, map, share, startWith, switchMap } from 'rxjs';
import type { Observable, ObservableInput } from 'rxjs';

@Service()
export class RealtimeInvalidationService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthService);
  private readonly currentUserId = toObservable(this.auth.user).pipe(
    map((user) => user?.sub ?? null),
    distinctUntilChanged(),
  );

  private readonly currentUserData = this.currentUserId.pipe(
    switchMap((userId) =>
      userId
        ? this.watch('/api/realtime/current-user/data/events', 'Não foi possível atualizar seus dados ao vivo.', () =>
            this.auth.refreshMe(),
          )
        : EMPTY,
    ),
    share(),
  );

  watchCatalog(): Observable<void> {
    return this.watch('/api/realtime/public/catalog/events', 'Não foi possível atualizar os eventos ao vivo.');
  }

  watchCurrentUserData(): Observable<void> {
    return this.currentUserData;
  }

  watchOrganizer(targetType: string, targetId: string): Observable<void> {
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
    if (!this.isBrowser || typeof EventSource === 'undefined') {
      return EMPTY;
    }
    return fromEvent(this.document, 'visibilitychange').pipe(
      startWith(undefined),
      map(() => this.document.visibilityState !== 'hidden'),
      distinctUntilChanged(),
      switchMap((visible) =>
        visible ? watchRecoveringReplayableEventSourcePing(url, { errorMessage, recover }) : EMPTY,
      ),
    );
  }
}
