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

const DEFAULT_REDIRECT_ROUTES = {
  MENU: true,
  CALENDAR: true,
  MAJOR_EVENT: true,
  WALLET: true,
} satisfies Record<DefaultRedirectRoute, true>;

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

          const route = response.data.currentUserDefaultRedirect;
          if (!isDefaultRedirectRoute(route)) {
            throw new Error('Resposta GraphQL com rota de redirecionamento inválida.');
          }

          return route;
        }),
      );
  }
}

function isDefaultRedirectRoute(value: unknown): value is DefaultRedirectRoute {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_REDIRECT_ROUTES, value);
}
