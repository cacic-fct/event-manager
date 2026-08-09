import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { watchReplayableEventSource } from '@cacic-fct/shared-angular';
import { map } from 'rxjs';
import { GraphqlHttpService } from '../graphql/graphql-http.service';
import type {
  SportsApplication,
  SportsCategoryRead,
  SportsMatchReview,
  SportsRegistrationRead,
  SportsTeamRead,
  SportsTournamentListItem,
  SportsTournamentRead,
} from './sports.models';

const TOURNAMENT_FIELDS = `
  tournament {
    id majorEventId status scoringMode selfSubscriptionEnabled
    selfSubscriptionAllowNoTeam selfSubscriptionAllowNoCategory
    allowPlayerMultipleTeams revision finishedAt
  }
  categories {
    id tournamentId eventGroupId eventGroup { id emoji } name sport customSportName division format status
    registrationStartDate registrationEndDate minimumRosterSize maximumRosterSize
    maximumCaptains maximumCoaches allowPlayerMultipleTeams periodsEnabled
    maximumPeriods periodLabel timerRulesJson scoreRulesJson rosterRulesJson bracketRulesJson
    standingsRulesJson rulesText registrationFormId revision
  }
  teams { id tournamentId name institution status logoUrl revision fieldRevisionsJson }
  scoreEntries { id tournamentId teamId source points reason revision }
  venues {
    id tournamentId placePresetId name courtLabel capacity notes parentVenueId revision
  }
  officials { id tournamentId categoryId matchId personId role active assignedAt revision }
  teamSummaries {
    team { id tournamentId name institution status logoUrl revision fieldRevisionsJson }
    registrations { id categoryId categoryName categoryEmoji status }
  }
`;

const CATEGORY_FIELDS = `
  category {
    id tournamentId eventGroupId eventGroup { id emoji } name sport customSportName division format status
    registrationStartDate registrationEndDate minimumRosterSize maximumRosterSize
    maximumCaptains maximumCoaches allowPlayerMultipleTeams periodsEnabled
    maximumPeriods periodLabel timerRulesJson scoreRulesJson rosterRulesJson bracketRulesJson
    standingsRulesJson rulesText registrationFormId revision
  }
  registrations { id teamId categoryId status seed formAnswersJson revision }
  stages { id categoryId name type displayOrder generationRevision }
  matches {
    id eventId event { id name startDate endDate locationDescription }
    categoryId stageId venueId homeRegistrationId awayRegistrationId
    state canonicalState reviewStatus scoreboard { homeScore awayScore }
    revision roundNumber bracketPosition groupKey notes livestreamProvider livestreamUrl
  }
  standings { id registrationId played wins draws losses scoreFor scoreAgainst points }
  placements { id registrationId placement pointsAwarded }
  officials { id tournamentId categoryId matchId personId role active assignedAt revision }
`;

const TEAM_FIELDS = `
  team { id tournamentId name institution status logoUrl revision fieldRevisionsJson }
  members { id teamId participantId status revision person { id name } }
  representatives { id personId person { id name } active assignedAt }
  registrations { id teamId categoryId status seed formAnswersJson revision }
  changeRequests {
    id type status requestRevision baseRevision deltaJson reviewMessage updatedAt
  }
`;

const MATCH_REVIEW_FIELDS = `
  match {
    id eventId event { id name startDate endDate locationDescription }
    categoryId stageId venueId homeRegistrationId awayRegistrationId
    state canonicalState reviewStatus scoreboard { homeScore awayScore }
    revision roundNumber bracketPosition groupKey notes livestreamProvider livestreamUrl
  }
  actions { id type payloadJson reviewStatus offline authoredAt }
  rosters {
    id registrationId status revision
    entries { id registrationMemberId status role shirtNumber roleMetadataJson }
  }
  officials { id personId role active revision }
`;

const REGISTRATION_FIELDS = `
  registration { id teamId categoryId status seed formAnswersJson revision }
  members {
    id registrationId categoryId teamMemberId role eligibility
    person { id name }
  }
  rosters {
    id matchId registrationId status revision
    entries { id registrationMemberId status role shirtNumber roleMetadataJson }
  }
`;

@Injectable()
export class SportsApiService {
  private readonly graphql = inject(GraphqlHttpService);
  private readonly http = inject(HttpClient);

  tournaments(filters?: { query?: string; skip?: number; take?: number }) {
    return this.graphql
      .request<{ adminSportsTournamentList: SportsTournamentListItem[] }>(
        `query AdminSportsTournamentList($query: String, $skip: Int, $take: Int) {
          adminSportsTournamentList(query: $query, skip: $skip, take: $take) {
            tournament {
              id majorEventId status scoringMode selfSubscriptionEnabled
              selfSubscriptionAllowNoTeam selfSubscriptionAllowNoCategory
              allowPlayerMultipleTeams revision finishedAt
            }
            majorEvent { id name emoji startDate endDate isPaymentRequired }
            categoryCount teamCount pendingApplicationCount pendingReviewCount
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.adminSportsTournamentList));
  }

  tournament(tournamentId: string) {
    return this.graphql
      .request<{ adminSportsTournamentRead: SportsTournamentRead }>(
        `query AdminSportsTournament($tournamentId: String!) {
          adminSportsTournamentRead(tournamentId: $tournamentId) { ${TOURNAMENT_FIELDS} }
        }`,
        { tournamentId },
      )
      .pipe(map((data) => data.adminSportsTournamentRead));
  }

  category(categoryId: string) {
    return this.graphql
      .request<{ adminSportsCategoryRead: SportsCategoryRead }>(
        `query AdminSportsCategory($categoryId: String!) {
          adminSportsCategoryRead(categoryId: $categoryId) { ${CATEGORY_FIELDS} }
        }`,
        { categoryId },
      )
      .pipe(map((data) => data.adminSportsCategoryRead));
  }

  team(teamId: string) {
    return this.graphql
      .request<{ adminSportsTeamRead: SportsTeamRead }>(
        `query AdminSportsTeam($teamId: String!) {
          adminSportsTeamRead(teamId: $teamId) { ${TEAM_FIELDS} }
        }`,
        { teamId },
      )
      .pipe(map((data) => data.adminSportsTeamRead));
  }

  registration(registrationId: string) {
    return this.graphql
      .request<{ adminSportsRegistrationRead: SportsRegistrationRead }>(
        `query AdminSportsRegistration($registrationId: String!) {
          adminSportsRegistrationRead(registrationId: $registrationId) { ${REGISTRATION_FIELDS} }
        }`,
        { registrationId },
      )
      .pipe(map((data) => data.adminSportsRegistrationRead));
  }

  matchReview(matchId: string) {
    return this.graphql
      .request<{ adminSportsMatchReviewRead: SportsMatchReview }>(
        `query AdminSportsMatchReview($matchId: String!) {
          adminSportsMatchReviewRead(matchId: $matchId) { ${MATCH_REVIEW_FIELDS} }
        }`,
        { matchId },
      )
      .pipe(map((data) => data.adminSportsMatchReviewRead));
  }

  applicationQueue(tournamentId: string, statuses = ['PENDING', 'CHANGES_REQUESTED']) {
    return this.graphql
      .request<{ adminSportsPlayerApplicationQueue: SportsApplication[] }>(
        `query AdminSportsApplications($tournamentId: String!, $statuses: [SportsApplicationStatus!]) {
          adminSportsPlayerApplicationQueue(tournamentId: $tournamentId, statuses: $statuses, limit: 100) {
            id tournamentId applicant { personId name }
            requestedTeam { id name institution logoUrl }
            categories { id name division }
            status participantStatus paymentStatus paymentTier imageLicenseAgreementAccepted reviewMessage createdAt
          }
        }`,
        { tournamentId, statuses },
      )
      .pipe(map((data) => data.adminSportsPlayerApplicationQueue));
  }

  mutate<TResult extends string | boolean | string[]>(name: string, inputType: string, input: Record<string, unknown>) {
    return this.graphql
      .request<
        Record<string, TResult>
      >(`mutation SportsWorkspaceMutation($input: ${inputType}!) { ${name}(input: $input) }`, { input })
      .pipe(map((data) => data[name]));
  }

  deleteVersioned(name: string, id: string, expectedRevision: number, tournamentId?: string) {
    return this.graphql
      .request<Record<string, boolean>>(
        `mutation SportsWorkspaceDelete(
          $id: String!
          $expectedRevision: Int!
          ${tournamentId ? '$tournamentId: String!' : ''}
        ) {
          ${name}(
            id: $id
            expectedRevision: $expectedRevision
            ${tournamentId ? 'tournamentId: $tournamentId' : ''}
          )
        }`,
        { id, expectedRevision, tournamentId },
      )
      .pipe(map((data) => data[name]));
  }

  uploadTeamLogo(teamId: string, expectedRevision: number, file: File) {
    const body = new FormData();
    body.append('expectedRevision', String(expectedRevision));
    body.append('file', file);
    return this.http.post<{
      teamId: string;
      revision: number;
      sha256: string;
      downloadUrl: string;
    }>(`/api/sports/admin/teams/${encodeURIComponent(teamId)}/logo`, body);
  }

  reviewApplication(input: Record<string, unknown>) {
    return this.mutate<string>('reviewSportsPlayerApplication', 'SportsPlayerApplicationReviewInput', input);
  }

  reviewTeamChange(input: Record<string, unknown>) {
    return this.mutate<string>('reviewSportsTeamChange', 'SportsTeamChangeReviewInput', input);
  }

  reviewMatchAction(input: Record<string, unknown>) {
    return this.mutate<string>('reviewSportsMatchAction', 'SportsMatchActionReviewInput', input);
  }

  watchTournamentReview(tournamentId: string) {
    return watchReplayableEventSource(`/api/sports/tournaments/${encodeURIComponent(tournamentId)}/review-events`, {
      decode: (event) => {
        const value: unknown = JSON.parse(event.data);
        return value && typeof value === 'object' ? value : null;
      },
      errorMessage: 'Não foi possível manter a gestão esportiva atualizada em tempo real.',
    });
  }
}
