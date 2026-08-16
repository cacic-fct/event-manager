import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CURRENT_USER_MY_DAY_QUERY,
  type CurrentUserMyDay,
  type CurrentUserMyDayQuery,
  type CurrentUserMyDayQueryVariables,
} from '@cacic-fct/event-manager-public-contracts';
import { Observable, map } from 'rxjs';
import { graphqlError } from '../shared/rate-limit-error';

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

@Injectable({ providedIn: 'root' })
export class MyDayApiService {
  private readonly http = inject(HttpClient);

  get(date: string): Observable<CurrentUserMyDay> {
    const variables: CurrentUserMyDayQueryVariables = { date };
    return this.http
      .post<GraphqlResponse<CurrentUserMyDayQuery>>('/api/graphql', {
        query: CURRENT_USER_MY_DAY_QUERY,
        variables,
      })
      .pipe(
        map((response) => {
          if (response.errors?.length) {
            throw graphqlError(response.errors);
          }
          if (!response.data) {
            throw new Error('Resposta GraphQL sem dados.');
          }
          return response.data.currentUserMyDay;
        }),
      );
  }
}
