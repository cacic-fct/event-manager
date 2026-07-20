import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CURRENT_USER_DEFAULT_REDIRECT_QUERY,
  type CurrentUserDefaultRedirectQuery,
  type DefaultRedirectRoute,
  type GraphqlResponse,
} from '@cacic-fct/event-manager-public-contracts';
import { Observable, map, timeout } from 'rxjs';
import { graphqlError } from '../shared/rate-limit-error';

export const DEFAULT_REDIRECT_TIMEOUT_MS = 400;

@Injectable({ providedIn: 'root' })
export class DefaultRedirectApiService {
  private readonly http = inject(HttpClient);

  getCurrentUserDefaultRedirect(): Observable<DefaultRedirectRoute> {
    return this.http
      .post<GraphqlResponse<CurrentUserDefaultRedirectQuery>>('/api/graphql', {
        query: CURRENT_USER_DEFAULT_REDIRECT_QUERY,
      })
      .pipe(
        timeout({ first: DEFAULT_REDIRECT_TIMEOUT_MS }),
        map((response) => {
          if (response.errors?.length) {
            throw graphqlError(response.errors);
          }

          if (!response.data) {
            throw new Error('Resposta GraphQL sem dados.');
          }

          return response.data.currentUserDefaultRedirect;
        }),
      );
  }
}
