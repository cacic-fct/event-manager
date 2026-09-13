import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { GraphqlResponse, GraphqlVariables } from '@cacic-fct/event-manager-public-contracts';
import type { EventInterest, InterestTargetType } from '@cacic-fct/shared-event-participation';
import { Observable, Subject, map, tap } from 'rxjs';
import { graphqlError } from '../shared/rate-limit-error';

const INTEREST_FIELDS = 'id personId eventId eventGroupId majorEventId createdAt';

export interface CurrentUserInterestState {
  interest: EventInterest | null;
  subscribed: boolean;
  endsAt: string;
  enabled: boolean;
}

@Service()
export class InterestApiService {
  private readonly http = inject(HttpClient);
  private readonly changedSubject = new Subject<void>();
  readonly changes = this.changedSubject.asObservable();

  getState(targetType: InterestTargetType, targetId: string): Observable<CurrentUserInterestState> {
    return this.query<{ currentUserInterestState: CurrentUserInterestState }>(`
      query CurrentUserInterestState($targetType: InterestTargetType!, $targetId: String!) {
        currentUserInterestState(targetType: $targetType, targetId: $targetId) {
          interest { ${INTEREST_FIELDS} }
          subscribed endsAt enabled
        }
      }
    `, { targetType, targetId }).pipe(map((data) => data.currentUserInterestState));
  }

  list(majorEventId?: string): Observable<EventInterest[]> {
    return this.query<{ currentUserInterests: EventInterest[] }>(`
      query CurrentUserInterests($majorEventId: String) {
        currentUserInterests(majorEventId: $majorEventId) { ${INTEREST_FIELDS} }
      }
    `, { majorEventId }).pipe(map((data) => data.currentUserInterests ?? []));
  }

  get(targetType: InterestTargetType, targetId: string): Observable<EventInterest | null> {
    return this.query<{ currentUserInterest: EventInterest | null }>(`
      query CurrentUserInterest($targetType: InterestTargetType!, $targetId: String!) {
        currentUserInterest(targetType: $targetType, targetId: $targetId) { ${INTEREST_FIELDS} }
      }
    `, { targetType, targetId }).pipe(map((data) => data.currentUserInterest));
  }

  set(targetType: InterestTargetType, targetId: string, interested: boolean): Observable<EventInterest | null> {
    return this.query<{ setCurrentUserInterest: EventInterest | null }>(`
      mutation SetCurrentUserInterest($targetType: InterestTargetType!, $targetId: String!, $interested: Boolean!) {
        setCurrentUserInterest(targetType: $targetType, targetId: $targetId, interested: $interested) {
          ${INTEREST_FIELDS}
        }
      }
    `, { targetType, targetId, interested }).pipe(
      map((data) => data.setCurrentUserInterest),
      tap(() => this.changedSubject.next()),
    );
  }

  private query<T>(query: string, variables: GraphqlVariables): Observable<T> {
    return this.http.post<GraphqlResponse<T>>('/api/graphql', { query, variables }).pipe(map((response) => {
      if (response.errors?.length) throw graphqlError(response.errors);
      if (!response.data) throw new Error('Não foi possível atualizar seu interesse. Tente novamente.');
      return response.data;
    }));
  }
}
