import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CURRENT_USER_MAP_EVENT_IDS_QUERY,
  type GraphqlResponse,
  type CurrentUserMapEventIdsQuery,
  type PublicMapEvent,
  type PublicMapEventsQuery,
  PUBLIC_MAP_EVENTS_QUERY,
} from '@cacic-fct/event-manager-public-contracts';
import { Observable, map, of, tap } from 'rxjs';
import { PublicMapCacheService } from './public-map-cache.service';

const MAP_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class PublicMapApiService {
  private readonly http = inject(HttpClient);
  private readonly cache = inject(PublicMapCacheService);

  getEvents(): Observable<PublicMapEvent[]> {
    const cached = this.cache.read<PublicMapEvent[]>('events');
    if (cached) {
      return of(cached);
    }

    return this.query<PublicMapEventsQuery>(PUBLIC_MAP_EVENTS_QUERY).pipe(
      map((data) => data.publicMapEvents),
      tap((events) => this.cache.write('events', events, MAP_CACHE_TTL_MS)),
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
      tap((eventIds) => this.cache.write(cacheKey, [...eventIds], MAP_CACHE_TTL_MS)),
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
