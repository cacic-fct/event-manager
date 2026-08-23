import { HttpClient } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import {
  CURRENT_USER_MAP_EVENT_IDS_QUERY,
  type GraphqlResponse,
  type CurrentUserMapEventIdsQuery,
  type PublicMapEvent,
  type PublicMapEventsQuery,
  PUBLIC_MAP_EVENTS_QUERY,
} from '@cacic-fct/event-manager-public-contracts';
import { Observable, catchError, from, map, of, switchMap, tap, throwError } from 'rxjs';
import { PublicMapCacheService } from './public-map-cache.service';

const MAP_CACHE_TTL_MS = 5 * 60 * 1000;
const MAP_OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Service()
export class PublicMapApiService {
  private readonly http = inject(HttpClient);
  private readonly cache = inject(PublicMapCacheService);
  readonly isUsingSavedData = signal(false);

  getEvents(): Observable<PublicMapEvent[]> {
    this.isUsingSavedData.set(false);
    const cached = this.cache.read<PublicMapEvent[]>('events');
    if (cached) {
      return of(cached);
    }

    return this.query<PublicMapEventsQuery>(PUBLIC_MAP_EVENTS_QUERY).pipe(
      map((data) => data.publicMapEvents),
      tap((events) => {
        this.cache.writeEvents(events, MAP_CACHE_TTL_MS);
      }),
      catchError((error) =>
        from(this.cache.readOfflineEvents(MAP_OFFLINE_MAX_AGE_MS)).pipe(
          switchMap((events) => {
            if (events === null) {
              return throwError(() => error);
            }
            this.isUsingSavedData.set(true);
            return of(events);
          }),
        ),
      ),
    );
  }

  getCurrentUserEventIds(userId: string): Observable<Set<string>> {
    const cacheKey = `mine:${userId}`;
    const cached = this.cache.read<string[]>(cacheKey);
    if (cached) {
      return of(new Set(cached));
    }

    return this.query<CurrentUserMapEventIdsQuery>(CURRENT_USER_MAP_EVENT_IDS_QUERY).pipe(
      map((data) => new Set(data.currentUserMapEventIds)),
      tap((eventIds) => this.cache.writeUserEventIds(userId, [...eventIds], MAP_CACHE_TTL_MS)),
      catchError((error) =>
        from(this.cache.readOfflineUserEventIds(userId, MAP_OFFLINE_MAX_AGE_MS)).pipe(
          switchMap((eventIds) => {
            if (eventIds === null) {
              return throwError(() => error);
            }
            this.isUsingSavedData.set(true);
            return of(new Set(eventIds));
          }),
        ),
      ),
    );
  }

  private query<TData>(query: string): Observable<TData> {
    return this.http.post<GraphqlResponse<TData>>('/api/graphql', { query }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors.map((error) => error.message).join('\n'));
        }
        if (!response.data) {
          throw new Error('Resposta GraphQL sem dados.');
        }
        return response.data;
      }),
    );
  }
}
