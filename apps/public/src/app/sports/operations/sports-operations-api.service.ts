import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  CurrentUserSportsPlayerApplication,
  CurrentUserTournamentOperations,
  RepresentativeTeamWorkspace,
  SportsLineupRead,
  SportsMatchAction,
  SportsOfflineCollectorCredential,
  SportsOfficialCheckIn,
  SportsOperationalMatch,
  SportsRosterCheckIn,
  SportsScannerCheckIn,
} from './sports-operations.types';

interface GraphqlError {
  message: string;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: GraphqlError[];
}

export interface QueuedSportsTeamLogo {
  requestId: string;
  requestRevision: number;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

@Service()
export class SportsOperationsApiService {
  private readonly http = inject(HttpClient);

  autoroute(): Observable<{ matchId?: string; teamId?: string; mode: string } | null> {
    return this.query<{
      currentUserSportsAutoroute: { matchId?: string; teamId?: string; mode: string } | null;
    }>(
      `query CurrentUserSportsAutoroute {
        currentUserSportsAutoroute { matchId teamId mode }
      }`,
    ).pipe(map((value) => value.currentUserSportsAutoroute));
  }

  match(matchId: string): Observable<SportsOperationalMatch> {
    return this.query<{
      currentUserSportsOperationalMatchDetail: Omit<
        SportsOperationalMatch,
        'revision' | 'homeRegistrationId' | 'awayRegistrationId' | 'rosters' | 'officials' | 'readiness'
      >;
      currentUserSportsMatchOperations: Pick<
        SportsOperationalMatch,
        'revision' | 'homeRegistrationId' | 'awayRegistrationId' | 'rosters' | 'officials' | 'readiness'
      >;
    }>(
      `query SportsOperationalMatch($matchId: String!) {
        currentUserSportsOperationalMatchDetail(matchId: $matchId) {
          id eventId categoryId state timerStartedAt timerStartedAtUnixMs timerPausedAt timerPausedAtUnixMs
          elapsedBeforePauseMs
          periodTimers {
            periodNumber startedAtUnixMs pausedAtUnixMs elapsedBeforePauseMs scheduledStartOffsetMs capMs allowOvertime
          }
          overallTimerEnabled periodTimerEnabled
          timerPeriodDurationMs timerPeriodStartOffsetsMs timerAllowOvertime
          homeTeam { id name institution logoUrl }
          awayTeam { id name institution logoUrl }
          scoreboard {
            homeScore awayScore activePeriod
            periods { number label homeScore awayScore completed }
          }
          schedule { startDate endDate venueName courtLabel locationDescription }
        }
        currentUserSportsMatchOperations(matchId: $matchId) {
          revision homeRegistrationId awayRegistrationId notes occurrencesJson
          readiness {
            ready
            issues { code message registrationId missing required actual }
          }
          rosters {
            id registrationId revision status
            team { id name institution logoUrl }
            entries { id attendanceSyncKey name role status checkedInAt shirtNumber }
          }
          officials { id attendanceSyncKey name role checkedInAt }
        }
      }`,
      { matchId },
    ).pipe(
      map((value) => ({
        ...value.currentUserSportsOperationalMatchDetail,
        ...value.currentUserSportsMatchOperations,
      })),
    );
  }

  commit(actions: readonly SportsMatchAction[]): Observable<string[]> {
    return this.query<{ commitSportsMatchActions: string[] }>(
      `mutation CommitSportsMatchActions($input: CommitSportsMatchActionsInput!) {
        commitSportsMatchActions(input: $input)
      }`,
      { input: { actions } },
    ).pipe(map((value) => value.commitSportsMatchActions));
  }

  createOfflineCollectorCredential(matchId: string): Observable<SportsOfflineCollectorCredential> {
    return this.query<{ createSportsOfflineCollectorCredential: SportsOfflineCollectorCredential }>(
      `mutation CreateSportsOfflineCollectorCredential($matchId: String!) {
        createSportsOfflineCollectorCredential(matchId: $matchId) {
          credential collectorPersonId issuedAt
        }
      }`,
      { matchId },
    ).pipe(map((value) => value.createSportsOfflineCollectorCredential));
  }

  checkIn(input: SportsRosterCheckIn): Observable<boolean> {
    return this.query<{ checkInSportsRosterEntry: boolean }>(
      `mutation CheckInSportsRosterEntry($matchId: String!, $input: SportsRosterCheckInInput!) {
        checkInSportsRosterEntry(matchId: $matchId, input: $input)
      }`,
      {
        matchId: input.matchId,
        input: {
          clientId: input.clientId,
          rosterEntryId: input.rosterEntryId,
          checkedInAt: input.checkedInAt,
          offline: input.offline,
          ...(input.collectorPersonId === undefined ? {} : { collectorPersonId: input.collectorPersonId }),
          ...(input.collectorCredential === undefined ? {} : { collectorCredential: input.collectorCredential }),
          ...(input.present === undefined ? {} : { present: input.present }),
        },
      },
    ).pipe(map((value) => value.checkInSportsRosterEntry));
  }

  checkInOfficial(input: SportsOfficialCheckIn): Observable<boolean> {
    return this.query<{ checkInSportsOfficial: boolean }>(
      `mutation CheckInSportsOfficial($matchId: String!, $input: SportsOfficialCheckInInput!) {
        checkInSportsOfficial(matchId: $matchId, input: $input)
      }`,
      {
        matchId: input.matchId,
        input: {
          clientId: input.clientId,
          officialAssignmentId: input.officialAssignmentId,
          checkedInAt: input.checkedInAt,
          ...(input.present === undefined ? {} : { present: input.present }),
          offline: input.offline,
          ...(input.collectorPersonId === undefined ? {} : { collectorPersonId: input.collectorPersonId }),
          ...(input.collectorCredential === undefined ? {} : { collectorCredential: input.collectorCredential }),
        },
      },
    ).pipe(map((value) => value.checkInSportsOfficial));
  }

  checkInFromScanner(input: SportsScannerCheckIn): Observable<boolean> {
    return this.query<{ checkInSportsMatchFromScannerCode: boolean }>(
      `mutation CheckInSportsMatchFromScannerCode($matchId: String!, $input: SportsRosterScannerCheckInInput!) {
        checkInSportsMatchFromScannerCode(matchId: $matchId, input: $input)
      }`,
      {
        matchId: input.matchId,
        input: {
          clientId: input.clientId,
          code: input.code,
          checkedInAt: input.checkedInAt,
          offline: input.offline,
          ...(input.collectorPersonId === undefined ? {} : { collectorPersonId: input.collectorPersonId }),
          ...(input.collectorCredential === undefined ? {} : { collectorCredential: input.collectorCredential }),
        },
      },
    ).pipe(map((value) => value.checkInSportsMatchFromScannerCode));
  }

  lineup(matchId: string, registrationId: string): Observable<SportsLineupRead> {
    return this.query<{ currentUserSportsLineup: SportsLineupRead }>(
      `query CurrentUserSportsLineup($matchId: String!, $registrationId: String!) {
        currentUserSportsLineup(matchId: $matchId, registrationId: $registrationId) {
          matchId matchRevision registrationId homeRegistrationId awayRegistrationId
          eligibleMembers { registrationMemberId name role shirtNumber }
          roster {
            id revision status
            entries { id registrationMemberId role status checkedInAt shirtNumber }
          }
        }
      }`,
      { matchId, registrationId },
    ).pipe(map((value) => value.currentUserSportsLineup));
  }

  representativeWorkspace(teamId: string): Observable<RepresentativeTeamWorkspace> {
    return this.query<{ currentUserSportsTeamWorkspace: RepresentativeTeamWorkspace }>(
      `query CurrentUserSportsTeamWorkspace($teamId: String!) {
        currentUserSportsTeamWorkspace(teamId: $teamId) {
          team { id name institution logoUrl }
          teamRevision
          queuedChanges {
            id type status requestRevision baseRevision deltaJson reviewMessage updatedAt
            identityHints { clientKey type displayHint }
          }
          members {
            id name status revision
            categoryRoles { registrationId categoryId categoryName role eligibility }
          }
          registrations { id categoryId categoryName categoryEmoji status }
          matches {
            id eventId state startDate endDate homeRegistrationId awayRegistrationId
            categoryId categoryName categoryEmoji
            homeTeam { id name institution logoUrl }
            awayTeam { id name institution logoUrl }
          }
          joinQueueCount
        }
      }`,
      { teamId },
    ).pipe(map((value) => value.currentUserSportsTeamWorkspace));
  }

  uploadTeamLogo(
    teamId: string,
    expectedRevision: number,
    file: File,
    expectedRequestRevision?: number,
  ): Observable<QueuedSportsTeamLogo> {
    const form = new FormData();
    form.set('file', file);
    form.set('expectedRevision', String(expectedRevision));
    const query =
      expectedRequestRevision == null ? '' : `?expectedRequestRevision=${encodeURIComponent(expectedRequestRevision)}`;
    return this.http.post<QueuedSportsTeamLogo>(
      `/api/sports/teams/${encodeURIComponent(teamId)}/logo-change${query}`,
      form,
    );
  }

  submitTeamChange(input: {
    teamId: string;
    type: string;
    baseRevision: number;
    expectedRequestRevision?: number;
    baseFieldRevisionsJson: string;
    deltaJson: string;
    pendingKey: string;
    identityClaims?: { clientKey: string; type: string; value: string }[];
  }): Observable<string> {
    return this.query<{ submitSportsTeamChange: string }>(
      `mutation SubmitSportsTeamChange($input: SportsTeamChangeRequestInput!) {
        submitSportsTeamChange(input: $input)
      }`,
      { input },
    ).pipe(map((value) => value.submitSportsTeamChange));
  }

  tournament(tournamentId: string, requestedTeamId: string | null = null): Observable<CurrentUserTournamentOperations> {
    return this.query<{ currentUserSportsTournamentDetail: CurrentUserTournamentOperations }>(
      `query CurrentUserSportsTournamentOperations($tournamentId: String!, $requestedTeamId: String) {
        currentUserSportsTournamentDetail(tournamentId: $tournamentId, requestedTeamId: $requestedTeamId) {
          imageLicenseAgreementAccepted
          tournament {
            id name emoji isPaymentRequired requiresImageLicenseAgreement selfSubscriptionAllowNoTeam selfSubscriptionAllowNoCategory
            paymentTiers { id name value }
            teams { id name institution logoUrl }
            categories { id name emoji division }
          }
        }
      }`,
      { tournamentId, requestedTeamId },
    ).pipe(map((value) => value.currentUserSportsTournamentDetail));
  }

  currentUserApplications(tournamentId: string): Observable<CurrentUserSportsPlayerApplication[]> {
    return this.query<{ currentUserSportsPlayerApplications: CurrentUserSportsPlayerApplication[] }>(
      `query CurrentUserSportsPlayerApplications($tournamentId: String!) {
        currentUserSportsPlayerApplications(tournamentId: $tournamentId) {
          id tournamentId status participantStatus paymentStatus paymentTier imageLicenseAgreementAccepted reviewedAt reviewMessage
          requestedTeam { id name institution logoUrl }
          categories { id name division }
        }
      }`,
      { tournamentId },
    ).pipe(map((value) => value.currentUserSportsPlayerApplications));
  }

  submitApplication(input: {
    tournamentId: string;
    applicationId?: string | null;
    requestedTeamId?: string | null;
    categoryIds: string[];
    noticeAccepted: boolean;
    imageLicenseAgreementAccepted?: boolean | null;
    paymentTier?: string | null;
    pendingKey: string;
  }): Observable<string> {
    return this.query<{ submitSportsPlayerApplication: string }>(
      `mutation SubmitSportsPlayerApplication($input: SportsPlayerApplicationCreateInput!) {
        submitSportsPlayerApplication(input: $input)
      }`,
      { input },
    ).pipe(map((value) => value.submitSportsPlayerApplication));
  }

  submitRoster(input: {
    matchId: string;
    registrationId: string;
    expectedRevision?: number;
    entries: { registrationMemberId: string; role: string; shirtNumber?: string | null }[];
  }): Observable<string> {
    return this.query<{ submitSportsMatchRoster: string }>(
      `mutation SubmitSportsMatchRoster($input: SportsMatchRosterUpsertInput!) {
        submitSportsMatchRoster(input: $input)
      }`,
      { input },
    ).pipe(map((value) => value.submitSportsMatchRoster));
  }

  reviewTeamApplication(input: {
    applicationId: string;
    teamId: string;
    approved: boolean;
    reviewMessage?: string;
  }): Observable<string> {
    return this.query<{ reviewRepresentativeSportsPlayerApplication: string }>(
      `mutation ReviewRepresentativeSportsPlayerApplication($input: SportsRepresentativeApplicationReviewInput!) {
        reviewRepresentativeSportsPlayerApplication(input: $input)
      }`,
      { input },
    ).pipe(map((value) => value.reviewRepresentativeSportsPlayerApplication));
  }

  forfeit(action: SportsMatchAction): Observable<string> {
    return this.query<{ forfeitSportsMatch: string }>(
      `mutation ForfeitSportsMatch($input: CommitSportsMatchActionsInput!) {
        forfeitSportsMatch(input: $input)
      }`,
      { input: { actions: [action] } },
    ).pipe(map((value) => value.forfeitSportsMatch));
  }

  private query<T>(query: string, variables: Record<string, unknown> = {}): Observable<T> {
    return this.http.post<GraphqlResponse<T>>('/api/graphql', { query, variables }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors.map((error) => error.message).join(' '));
        }
        if (!response.data) {
          throw new Error('A resposta do servidor não trouxe os dados esperados.');
        }
        return response.data;
      }),
    );
  }
}
