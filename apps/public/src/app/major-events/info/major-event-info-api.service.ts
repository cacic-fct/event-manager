import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import {
  PUBLIC_MAJOR_EVENT_INFO_QUERY,
  PUBLIC_MAJOR_EVENT_PROGRAM_QUERY,
  type GraphqlResponse,
  type GraphqlVariables,
  type PublicMajorEventInfoQuery,
  type PublicMajorEventProgramQuery,
} from '@cacic-fct/event-manager-public-contracts';
import { map } from 'rxjs';
import { graphqlError } from '../../shared/rate-limit-error';

export const MAJOR_EVENT_PROGRAM_PAGE_SIZE = 100;

@Service()
export class MajorEventInfoApiService {
  private readonly http = inject(HttpClient);

  getMajorEvent(majorEventId: string) {
    return this.query<PublicMajorEventInfoQuery>(PUBLIC_MAJOR_EVENT_INFO_QUERY, { majorEventId }).pipe(
      map((data) => data.publicMajorEvent),
    );
  }

  getProgram(majorEventId: string, skip = 0) {
    return this.query<PublicMajorEventProgramQuery>(PUBLIC_MAJOR_EVENT_PROGRAM_QUERY, {
      majorEventId,
      skip,
      take: MAJOR_EVENT_PROGRAM_PAGE_SIZE,
    }).pipe(map((data) => data.publicEvents));
  }

  private query<TData>(query: string, variables: GraphqlVariables) {
    return this.http.post<GraphqlResponse<TData>>('/api/graphql', { query, variables }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw graphqlError(response.errors);
        }
        if (!response.data) {
          throw new Error('Resposta GraphQL sem dados.');
        }
        return response.data;
      }),
    );
  }
}
