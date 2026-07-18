import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  PUBLIC_PLATFORM_STATS_QUERY,
  type GraphqlResponse,
  type PublicPlatformStatsQuery,
} from '@cacic-fct/event-manager-public-contracts';
import { Observable, map } from 'rxjs';
import { graphqlError } from '../shared/rate-limit-error';

@Injectable({ providedIn: 'root' })
export class PlatformStatsApiService {
  private readonly http = inject(HttpClient);

  getPublicPlatformStats(): Observable<PublicPlatformStatsQuery['publicPlatformStats']> {
    return this.http.post<GraphqlResponse<PublicPlatformStatsQuery>>('/api/graphql', {
      query: PUBLIC_PLATFORM_STATS_QUERY,
    }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw graphqlError(response.errors);
        }

        if (!response.data) {
          throw new Error('Resposta GraphQL sem dados.');
        }

        return response.data.publicPlatformStats;
      }),
    );
  }
}
