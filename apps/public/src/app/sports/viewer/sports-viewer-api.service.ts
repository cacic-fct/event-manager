import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { GraphqlResponse, GraphqlVariables } from '@cacic-fct/event-manager-public-contracts';
import { AuthService } from '@cacic-fct/shared-angular';
import { Observable, map } from 'rxjs';
import { graphqlError } from '../../shared/rate-limit-error';
import type { PublicSportsMatch, PublicSportsTournamentDetail } from './sports-viewer.types';

const PUBLIC_TEAM_FIELDS = `
  id
  name
  institution
  logoUrl
`;

const PUBLIC_MATCH_FIELDS = `
  id
  eventId
  categoryId
  stageId
  homeTeam { ${PUBLIC_TEAM_FIELDS} }
  awayTeam { ${PUBLIC_TEAM_FIELDS} }
  state
  scoreboard {
    homeScore
    awayScore
    activePeriod
    periods {
      number
      label
      homeScore
      awayScore
      completed
    }
  }
  winner { ${PUBLIC_TEAM_FIELDS} }
  loser { ${PUBLIC_TEAM_FIELDS} }
  lossReason
  lossReasonDetail
  drawWillReschedule
  timerStartedAt
  timerStartedAtUnixMs
  timerPausedAt
  timerPausedAtUnixMs
  elapsedBeforePauseMs
  periodTimers {
    periodNumber
    startedAtUnixMs
    pausedAtUnixMs
    elapsedBeforePauseMs
    scheduledStartOffsetMs
    capMs
    allowOvertime
  }
  overallTimerEnabled
  periodTimerEnabled
  timerPeriodDurationMs
  timerPeriodStartOffsetsMs
  timerAllowOvertime
  roundNumber
  bracketPosition
  groupKey
  livestreamProvider
  livestreamUrl
  schedule {
    startDate
    endDate
    locationDescription
    latitude
    longitude
    venueName
    courtLabel
  }
  rosters {
    team { ${PUBLIC_TEAM_FIELDS} }
    entries {
      name
      role
    }
  }
  officials {
    name
    role
  }
`;

const PUBLIC_TOURNAMENT_FIELDS = `
  id
  majorEventId
  name
  emoji
  description
  startDate
  endDate
  selfSubscriptionEnabled
  isPaymentRequired
  paymentTiers { id name value }
  teams { ${PUBLIC_TEAM_FIELDS} }
  overallScores {
    team { ${PUBLIC_TEAM_FIELDS} }
    points
  }
  matches { ${PUBLIC_MATCH_FIELDS} }
  categories {
    id
    name
    emoji
    sport
    customSportName
    division
    format
    rulesText
    standings {
      team { ${PUBLIC_TEAM_FIELDS} }
      played
      wins
      draws
      losses
      scoreFor
      scoreAgainst
      points
      rank
    }
    placements {
      team { ${PUBLIC_TEAM_FIELDS} }
      placement
      pointsAwarded
    }
    brackets {
      id
      name
      type
      displayOrder
      matches { ${PUBLIC_MATCH_FIELDS} }
    }
    matches { ${PUBLIC_MATCH_FIELDS} }
  }
`;

@Injectable({ providedIn: 'root' })
export class SportsViewerApiService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  getTournament(tournamentId: string): Observable<PublicSportsTournamentDetail> {
    if (this.auth.isAuthenticated()) {
      return this.getCurrentUserTournament(tournamentId);
    }

    return this.query<{ publicSportsTournamentDetail: PublicSportsTournamentDetail }>(
      `
        query PublicSportsTournamentDetail($tournamentId: String!) {
          publicSportsTournamentDetail(tournamentId: $tournamentId) {
            ${PUBLIC_TOURNAMENT_FIELDS}
          }
        }
      `,
      { tournamentId },
    ).pipe(map((data) => data.publicSportsTournamentDetail));
  }

  private getCurrentUserTournament(tournamentId: string): Observable<PublicSportsTournamentDetail> {
    return this.query<{
      currentUserSportsTournamentDetail: {
        tournament: PublicSportsTournamentDetail;
        orderedMatches: PublicSportsMatch[];
      };
    }>(
      `
        query CurrentUserSportsTournamentDetail($tournamentId: String!) {
          currentUserSportsTournamentDetail(tournamentId: $tournamentId) {
            tournament {
              ${PUBLIC_TOURNAMENT_FIELDS}
            }
            orderedMatches { ${PUBLIC_MATCH_FIELDS} }
          }
        }
      `,
      { tournamentId },
    ).pipe(
      map(({ currentUserSportsTournamentDetail }) => ({
        ...currentUserSportsTournamentDetail.tournament,
        matches: currentUserSportsTournamentDetail.orderedMatches,
        matchesArePersonalized: true,
      })),
    );
  }

  getMatch(matchId: string): Observable<PublicSportsMatch> {
    return this.query<{ publicSportsMatchDetail: PublicSportsMatch }>(
      `
        query PublicSportsMatchDetail($matchId: String!) {
          publicSportsMatchDetail(matchId: $matchId) {
            ${PUBLIC_MATCH_FIELDS}
          }
        }
      `,
      { matchId },
    ).pipe(map((data) => data.publicSportsMatchDetail));
  }

  private query<TData>(query: string, variables: GraphqlVariables): Observable<TData> {
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
