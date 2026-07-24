import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { GraphqlResponse, GraphqlVariables } from '@cacic-fct/event-manager-public-contracts';
import { Observable, map } from 'rxjs';

export interface CurrentUserCalendarFeedSettings {
  enabled: boolean;
  feedPath?: string | null;
  disabledAt?: string | null;
  disabledReason?: string | null;
}

const CURRENT_USER_CALENDAR_PREFERENCES_FIELDS = `
  enabled
  feedPath
  disabledAt
  disabledReason
`;

@Injectable({ providedIn: 'root' })
export class CalendarPreferencesApiService {
  private readonly http = inject(HttpClient);

  getSettings(): Observable<CurrentUserCalendarFeedSettings> {
    return this.query<{ currentUserCalendarFeedSettings: CurrentUserCalendarFeedSettings }>(
      `
        query CurrentUserCalendarFeedSettings {
          currentUserCalendarFeedSettings {
            ${CURRENT_USER_CALENDAR_PREFERENCES_FIELDS}
          }
        }
      `,
    ).pipe(map((data) => data.currentUserCalendarFeedSettings));
  }

  setEnabled(enabled: boolean): Observable<CurrentUserCalendarFeedSettings> {
    return this.query<{ setCurrentUserCalendarFeedEnabled: CurrentUserCalendarFeedSettings }>(
      `
        mutation SetCurrentUserCalendarFeedEnabled($enabled: Boolean!) {
          setCurrentUserCalendarFeedEnabled(enabled: $enabled) {
            ${CURRENT_USER_CALENDAR_PREFERENCES_FIELDS}
          }
        }
      `,
      { enabled },
    ).pipe(map((data) => data.setCurrentUserCalendarFeedEnabled));
  }

  rotateKey(): Observable<CurrentUserCalendarFeedSettings> {
    return this.query<{ rotateCurrentUserCalendarFeedKey: CurrentUserCalendarFeedSettings }>(
      `
        mutation RotateCurrentUserCalendarFeedKey {
          rotateCurrentUserCalendarFeedKey {
            ${CURRENT_USER_CALENDAR_PREFERENCES_FIELDS}
          }
        }
      `,
    ).pipe(map((data) => data.rotateCurrentUserCalendarFeedKey));
  }

  private query<TData>(query: string, variables?: GraphqlVariables): Observable<TData> {
    return this.http.post<GraphqlResponse<TData>>('/api/graphql', { query, variables }).pipe(
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
