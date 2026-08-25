import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { map, of, switchMap } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import {
  SubscriptionStatus,
  WorkspaceEventSubscription,
  WorkspaceMajorEventSubscription,
} from '@cacic-fct/event-manager-admin-contracts';
import type { SportsTeamView } from '@cacic-fct/shared-frontend-types';
import { PERSON_EXPORT_FIELDS } from './graphql-query-fragments';
import { SubscriberCsvExportDialogOptions } from '../subscriptions/subscriber-csv-export';
import type { SportsApplication } from '../sports/sports.models';

export interface MajorEventSportsSubscriptionWorkspace {
  tournamentId: string;
  teams: SportsTeamView[];
  applications: SportsApplication[];
  participants: MajorEventSportsParticipant[];
}

export interface MajorEventSportsParticipant {
  id: string;
  person: { id: string; name: string };
  source: string;
  status: string;
  paymentStatus: string;
  teams: Array<{
    memberId: string;
    teamId: string;
    teamName: string;
    status: string;
    categories: Array<{ id: string; name: string; division?: string | null }>;
  }>;
}

export interface SubscriptionBadgeArchiveDownload {
  blob: Blob;
  fileName: string;
}

const WORKSPACE_EVENT_SUBSCRIPTION_FIELDS = `
  id
  eventId
  personId
  eventGroupSubscriptionId
  majorEventSubscriptionId
  createdAt
  createdById
  createdByMethod
  isLecturerSubscription
  person {
    ${PERSON_EXPORT_FIELDS}
  }
`;

const WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_FIELDS = `
  id
  majorEventId
  personId
  subscriptionStatus
  amountPaid
  paymentDate
  paymentTier
  imageLicenseAgreementAccepted
  createdAt
  createdById
  createdByMethod
  majorEvent {
    id
    name
  }
  person {
    ${PERSON_EXPORT_FIELDS}
  }
  events {
    eventId
    eventName
    eventStartDate
    subscribed
    isLecturerSubscription
  }
`;

@Service()
export class SubscriptionApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);
  private readonly http = inject(HttpClient);

  majorEventSportsWorkspace(majorEventId: string) {
    return this.graphqlHttp
      .request<{
        adminSportsTournamentList: Array<{ tournament: { id: string; majorEventId: string } }>;
      }>(
        `query MajorEventSportsTournament {
          adminSportsTournamentList(take: 200) { tournament { id majorEventId } }
        }`,
      )
      .pipe(
        switchMap(({ adminSportsTournamentList }) => {
          const tournament = adminSportsTournamentList.find((item) => item.tournament.majorEventId === majorEventId);
          if (!tournament) {
            return of(null);
          }
          const tournamentId = tournament.tournament.id;
          return this.graphqlHttp
            .request<{
              adminSportsTournamentRead: {
                teams: Array<SportsTeamView & { status: string }>;
                participants: MajorEventSportsParticipant[];
              };
              adminSportsPlayerApplicationQueue: SportsApplication[];
            }>(
              `query MajorEventSportsSubscriptions(
                $tournamentId: String!
                $statuses: [SportsApplicationStatus!]
              ) {
                adminSportsTournamentRead(tournamentId: $tournamentId) {
                  teams { id tournamentId name institution status logoUrl revision fieldRevisionsJson }
                  participants {
                    id person { id name } source status paymentStatus
                    teams {
                      memberId teamId teamName status
                      categories { id name division }
                    }
                  }
                }
                adminSportsPlayerApplicationQueue(tournamentId: $tournamentId, statuses: $statuses, limit: 200) {
                  id tournamentId applicant { personId name }
                  requestedTeam { id name institution logoUrl }
                  categories { id name division }
                  status participantStatus paymentStatus paymentTier imageLicenseAgreementAccepted reviewMessage createdAt
                }
              }`,
              {
                tournamentId,
                statuses: [
                  'PENDING',
                  'APPROVED',
                  'CHANGES_REQUESTED',
                  'REJECTED',
                  'WAITING_PAYMENT',
                  'ACTIVE',
                  'WITHDRAWN',
                ],
              },
            )
            .pipe(
              map(
                (data): MajorEventSportsSubscriptionWorkspace => ({
                  tournamentId,
                  teams: data.adminSportsTournamentRead.teams.filter((team) => team.status === 'ACTIVE'),
                  applications: data.adminSportsPlayerApplicationQueue,
                  participants: data.adminSportsTournamentRead.participants,
                }),
              ),
            );
        }),
      );
  }

  reviewSportsApplication(input: {
    applicationId: string;
    decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
    assignedTeamId?: string | null;
    reviewMessage?: string | null;
  }) {
    return this.graphqlHttp
      .request<{ reviewSportsPlayerApplication: string }>(
        `mutation ReviewMajorEventSportsApplication($input: SportsPlayerApplicationReviewInput!) {
          reviewSportsPlayerApplication(input: $input)
        }`,
        { input },
      )
      .pipe(map((data) => data.reviewSportsPlayerApplication));
  }

  setSportsParticipantTeam(input: { participantId: string; teamId: string | null }) {
    return this.graphqlHttp
      .request<{ setSportsParticipantTeam: string }>(
        `mutation SetSportsParticipantTeam($input: SportsParticipantTeamAssignmentInput!) {
          setSportsParticipantTeam(input: $input)
        }`,
        { input },
      )
      .pipe(map((data) => data.setSportsParticipantTeam));
  }

  listEventSubscriptions(eventId: string, filters?: { skip?: number; take?: number }) {
    return this.graphqlHttp
      .request<{ workspaceEventSubscriptions: WorkspaceEventSubscription[] }>(
        `query WorkspaceEventSubscriptions($eventId: String!, $skip: Int, $take: Int) {
          workspaceEventSubscriptions(eventId: $eventId, skip: $skip, take: $take) {
            ${WORKSPACE_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { eventId, skip: filters?.skip, take: filters?.take },
      )
      .pipe(map((data) => data.workspaceEventSubscriptions));
  }

  createEventSubscription(input: { eventId: string; personId: string }) {
    return this.graphqlHttp
      .request<{
        createWorkspaceEventSubscription: WorkspaceEventSubscription;
      }>(
        `mutation CreateWorkspaceEventSubscription(
          $input: WorkspaceEventSubscriptionCreateInput!
        ) {
          createWorkspaceEventSubscription(input: $input) {
            ${WORKSPACE_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createWorkspaceEventSubscription));
  }

  listMajorEventSubscriptions(majorEventId: string, filters?: { query?: string; skip?: number; take?: number }) {
    return this.graphqlHttp
      .request<{
        workspaceMajorEventSubscriptions: WorkspaceMajorEventSubscription[];
      }>(
        `query WorkspaceMajorEventSubscriptions($majorEventId: String!, $query: String, $skip: Int, $take: Int) {
          workspaceMajorEventSubscriptions(majorEventId: $majorEventId, query: $query, skip: $skip, take: $take) {
            ${WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { majorEventId, query: filters?.query, skip: filters?.skip, take: filters?.take },
      )
      .pipe(map((data) => data.workspaceMajorEventSubscriptions));
  }

  getMajorEventSubscription(majorEventId: string, subscriptionId: string) {
    return this.graphqlHttp
      .request<{
        workspaceMajorEventSubscription: WorkspaceMajorEventSubscription;
      }>(
        `query WorkspaceMajorEventSubscription($majorEventId: String!, $subscriptionId: String!) {
          workspaceMajorEventSubscription(majorEventId: $majorEventId, subscriptionId: $subscriptionId) {
            ${WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { majorEventId, subscriptionId },
      )
      .pipe(map((data) => data.workspaceMajorEventSubscription));
  }

  createMajorEventSubscription(input: {
    majorEventId: string;
    personId: string;
    subscriptionStatus?: SubscriptionStatus;
    amountPaid?: number | null;
    paymentDate?: string | null;
    paymentTier?: string | null;
    imageLicenseAgreementAccepted?: boolean;
    selectedEventIds: string[];
  }) {
    return this.graphqlHttp
      .request<{
        createWorkspaceMajorEventSubscription: WorkspaceMajorEventSubscription;
      }>(
        `mutation CreateWorkspaceMajorEventSubscription(
          $input: WorkspaceMajorEventSubscriptionCreateInput!
        ) {
          createWorkspaceMajorEventSubscription(input: $input) {
            ${WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createWorkspaceMajorEventSubscription));
  }

  updateMajorEventSubscription(
    id: string,
    input: {
      subscriptionStatus?: SubscriptionStatus;
      amountPaid?: number | null;
      paymentDate?: string | null;
      paymentTier?: string | null;
      imageLicenseAgreementAccepted?: boolean;
      selectedEventIds?: string[];
    },
  ) {
    return this.graphqlHttp
      .request<{
        updateWorkspaceMajorEventSubscription: WorkspaceMajorEventSubscription;
      }>(
        `mutation UpdateWorkspaceMajorEventSubscription(
          $id: String!
          $input: WorkspaceMajorEventSubscriptionUpdateInput!
        ) {
          updateWorkspaceMajorEventSubscription(id: $id, input: $input) {
            ${WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updateWorkspaceMajorEventSubscription));
  }

  downloadEventSubscriptionBadgeArchive(eventId: string, options: SubscriberCsvExportDialogOptions) {
    return this.downloadBadgeArchive(
      `/api/subscription-exports/events/${encodeURIComponent(eventId)}/badges.zip`,
      options,
    );
  }

  downloadMajorEventSubscriptionBadgeArchive(majorEventId: string, options: SubscriberCsvExportDialogOptions) {
    return this.downloadBadgeArchive(
      `/api/subscription-exports/major-events/${encodeURIComponent(majorEventId)}/badges.zip`,
      options,
    );
  }

  private downloadBadgeArchive(url: string, options: SubscriberCsvExportDialogOptions) {
    return this.http
      .post(
        url,
        {
          fields: options.fields,
          identityDocumentMode: options.identityDocumentMode,
          errorCorrectionLevel: options.badgeCodes.errorCorrectionLevel,
          format: options.badgeCodes.format,
          fileName: options.badgeCodes.fileName,
        },
        { observe: 'response', responseType: 'blob' },
      )
      .pipe(
        map((response): SubscriptionBadgeArchiveDownload => {
          if (!response.body) {
            throw new Error('O arquivo de códigos não foi retornado pelo servidor.');
          }

          return {
            blob: response.body,
            fileName: this.fileNameFromDisposition(response.headers.get('content-disposition')),
          };
        }),
      );
  }

  private fileNameFromDisposition(disposition: string | null): string {
    const encodedMatch = disposition?.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    const fileName = encodedMatch
      ? decodeURIComponent(encodedMatch[1])
      : disposition?.match(/filename="?([^";]+)"?/i)?.[1];
    return fileName?.replace(/[\\/]/g, '') || 'codigos-para-cracha.zip';
  }
}
