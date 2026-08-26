import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import {
  GraphqlResponse,
  PublicPrizeDraw,
  PublicPrizeDrawAvailability,
  PublicPrizeDrawScopeType,
} from '@cacic-fct/event-manager-public-contracts';
import { watchReplayableEventSourcePing } from '@cacic-fct/shared-angular';
import { Observable, map } from 'rxjs';
import { graphqlError } from '../shared/rate-limit-error';

const PUBLIC_PRIZE_DRAW_FIELDS = `
  id
  title
  description
  target {
    type
    id
    name
  }
  includePresent
  includeSubscribers
  includeManualEntries
  chanceMode
  spinLimit
  removeWinnerAfterDraw
  frozenAt
  revision
  spins {
    id
    sequence
    description
    speed
    countdownSeconds
    chanceMode
    removeWinnerAfterDraw
    winnerDisplayName
    winnerWeight
    entrantCount
    totalWeight
    duplicateEntryCount
    weightBreakdown {
      weight
      peopleCount
    }
    eligibilityFrozenAt
    drawnAt
  }
  createdAt
  updatedAt
`;

@Service()
export class PublicPrizeDrawApiService {
  private readonly http = inject(HttpClient);

  list(input: { targetType: PublicPrizeDrawScopeType; targetId: string }): Observable<PublicPrizeDraw[]> {
    const variables = {
      eventId: input.targetType === 'EVENT' ? input.targetId : null,
      eventGroupId: input.targetType === 'EVENT_GROUP' ? input.targetId : null,
      majorEventId: input.targetType === 'MAJOR_EVENT' ? input.targetId : null,
    };
    return this.query<{ publicPrizeDraws: PublicPrizeDraw[] }>(
      `
        query PublicPrizeDraws($eventId: String, $eventGroupId: String, $majorEventId: String) {
          publicPrizeDraws(eventId: $eventId, eventGroupId: $eventGroupId, majorEventId: $majorEventId) {
            ${PUBLIC_PRIZE_DRAW_FIELDS}
          }
        }
      `,
      variables,
    ).pipe(
      map((data) =>
        data.publicPrizeDraws.map((draw) => ({
          ...draw,
          spins: [...draw.spins].sort(
            (left, right) => left.sequence - right.sequence || left.drawnAt.localeCompare(right.drawnAt),
          ),
        })),
      ),
    );
  }

  availability(input: {
    eventIds?: string[];
    eventGroupIds?: string[];
    majorEventIds?: string[];
  }): Observable<PublicPrizeDrawAvailability[]> {
    return this.query<{ publicPrizeDrawAvailability: PublicPrizeDrawAvailability[] }>(
      `
        query PublicPrizeDrawAvailability(
          $eventIds: [String!]
          $eventGroupIds: [String!]
          $majorEventIds: [String!]
        ) {
          publicPrizeDrawAvailability(
            eventIds: $eventIds
            eventGroupIds: $eventGroupIds
            majorEventIds: $majorEventIds
          ) {
            targetType
            targetId
            drawCount
          }
        }
      `,
      input,
    ).pipe(map((data) => data.publicPrizeDrawAvailability));
  }

  watch(input: { targetType: PublicPrizeDrawScopeType; targetId: string }): Observable<void> {
    const segment = {
      EVENT: 'events',
      EVENT_GROUP: 'event-groups',
      MAJOR_EVENT: 'major-events',
    }[input.targetType];
    return watchReplayableEventSourcePing(
      `/api/prize-draws/public/${segment}/${encodeURIComponent(input.targetId)}/events`,
      'Não foi possível acompanhar os sorteios em tempo real.',
    );
  }

  private query<TData>(query: string, variables?: Record<string, unknown>): Observable<TData> {
    return this.http.post<GraphqlResponse<TData>>('/api/graphql', { query, variables }).pipe(
      map((response) => {
        if (response.errors?.length) throw graphqlError(response.errors);
        if (!response.data) throw new Error('Resposta GraphQL sem dados.');
        return response.data;
      }),
    );
  }
}
