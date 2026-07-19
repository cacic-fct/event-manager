import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { SERVER_VERSION_QUERY, type GraphqlResponse, type ServerVersionQuery } from '@cacic-fct/event-manager-public-contracts';
import { Observable, map } from 'rxjs';
import { graphqlError } from '../shared/rate-limit-error';

@Injectable({ providedIn: 'root' })
export class ServerVersionApiService {
  private readonly http = inject(HttpClient);

  getServerVersion(): Observable<string> {
    return this.http.post<GraphqlResponse<ServerVersionQuery>>('/api/graphql', { query: SERVER_VERSION_QUERY }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw graphqlError(response.errors);
        }

        if (!response.data) {
          throw new Error('Resposta GraphQL sem dados.');
        }

        return response.data.serverVersion;
      }),
    );
  }
}
