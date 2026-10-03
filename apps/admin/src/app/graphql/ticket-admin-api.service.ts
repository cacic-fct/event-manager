import { Service, inject } from '@angular/core';
import { map } from 'rxjs';
import type {
  AdminEventTicket,
  AdminEventTicketList,
  AdminTicketConfig,
  AdminTicketEligibility,
  AdminTicketHistoryEntry,
  AdminTicketIssueInput,
  AdminTicketRevokeInput,
  AdminTicketTransferInput,
  TicketConfigInput,
  TicketLifecycleState,
  TicketTransfer,
} from '@cacic-fct/shared-ticketing';
import { GraphqlHttpService } from './graphql-http.service';

export type AdminTicketListFilters = {
  eventId: string;
  status?: TicketLifecycleState | null;
  search?: string;
  take?: number;
  cursor?: string | null;
};

@Service()
export class TicketAdminApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  getConfigs(target: { eventId?: string; majorEventId?: string }): import('rxjs').Observable<AdminTicketConfig[]> {
    return this.graphqlHttp
      .request<{ adminTicketConfigs: AdminTicketConfig[] }>(
        `query AdminTicketConfigs($eventId: String, $majorEventId: String) {
          adminTicketConfigs(eventId: $eventId, majorEventId: $majorEventId) {
            ${ADMIN_TICKET_CONFIG_FIELDS}
          }
        }`,
        target,
      )
      .pipe(map((data) => data.adminTicketConfigs ?? []));
  }

  saveConfig(input: TicketConfigInput): import('rxjs').Observable<AdminTicketConfig> {
    return this.graphqlHttp
      .request<{ saveTicketConfig: AdminTicketConfig }>(
        `mutation SaveTicketConfig($input: TicketConfigInput!) {
          saveTicketConfig(input: $input) {
            ${ADMIN_TICKET_CONFIG_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.saveTicketConfig));
  }

  getEligibilityWarnings(eventId: string, personId: string): import('rxjs').Observable<AdminTicketEligibility> {
    return this.graphqlHttp
      .request<{ adminTicketEligibilityWarnings: AdminTicketEligibility }>(
        `query AdminTicketEligibilityWarnings($eventId: String!, $personId: String!) {
          adminTicketEligibilityWarnings(eventId: $eventId, personId: $personId) {
            eligible
            warnings { code message }
          }
        }`,
        { eventId, personId },
      )
      .pipe(map((data) => data.adminTicketEligibilityWarnings));
  }

  getEventTickets(filters: AdminTicketListFilters): import('rxjs').Observable<AdminEventTicketList> {
    return this.graphqlHttp
      .request<{ adminEventTickets: AdminEventTicketList }>(
        `query AdminEventTickets(
          $eventId: String!
          $status: String
          $search: String
          $take: Int
          $cursor: String
        ) {
          adminEventTickets(
            eventId: $eventId
            status: $status
            search: $search
            take: $take
            cursor: $cursor
          ) {
            totalCount
            nextCursor
            tickets { ${ADMIN_EVENT_TICKET_FIELDS} }
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.adminEventTickets ?? { tickets: [], nextCursor: null, totalCount: 0 }));
  }

  issueTicket(input: AdminTicketIssueInput): import('rxjs').Observable<AdminEventTicket> {
    return this.graphqlHttp
      .request<{ adminIssueTicket: AdminEventTicket }>(
        `mutation AdminIssueTicket($input: AdminTicketIssueInput!) {
          adminIssueTicket(input: $input) { ${ADMIN_EVENT_TICKET_FIELDS} }
        }`,
        { input },
      )
      .pipe(map((data) => data.adminIssueTicket));
  }

  revokeTicket(input: AdminTicketRevokeInput): import('rxjs').Observable<AdminEventTicket> {
    return this.graphqlHttp
      .request<{ adminRevokeTicket: AdminEventTicket }>(
        `mutation AdminRevokeTicket($input: AdminTicketRevokeInput!) {
          adminRevokeTicket(input: $input) { ${ADMIN_EVENT_TICKET_FIELDS} }
        }`,
        { input },
      )
      .pipe(map((data) => data.adminRevokeTicket));
  }

  startTransfer(input: AdminTicketTransferInput): import('rxjs').Observable<TicketTransfer> {
    return this.graphqlHttp
      .request<{ adminStartTicketTransfer: TicketTransfer }>(
        `mutation AdminStartTicketTransfer($input: AdminTicketTransferInput!) {
          adminStartTicketTransfer(input: $input) { ${TICKET_TRANSFER_FIELDS} }
        }`,
        { input },
      )
      .pipe(map((data) => data.adminStartTicketTransfer));
  }

  getHistory(ticketId: string): import('rxjs').Observable<AdminTicketHistoryEntry[]> {
    return this.graphqlHttp
      .request<{ adminTicketHistory: AdminTicketHistoryEntry[] }>(
        `query AdminTicketHistory($ticketId: String!) {
          adminTicketHistory(ticketId: $ticketId) {
            id
            ticketId
            operation
            previousHolder { ${TICKET_PERSON_FIELDS} }
            newHolder { ${TICKET_PERSON_FIELDS} }
            actorName
            reason
            createdAt
          }
        }`,
        { ticketId },
      )
      .pipe(map((data) => data.adminTicketHistory ?? []));
  }
}

const TICKET_PERSON_FIELDS = `
  personId
  fullName
  firstName
  avatarUrl
  redactedIdentityDocument
`;

const TICKET_EVENT_FIELDS = `
  id
  name
  emoji
  startsAt
  endsAt
  publicUrl
`;

const TICKET_RECIPIENT_POLICY_FIELDS = `
  subscriptionRequirement
  requiresUnesp
  requiredAcademicIdPrefixes
  requiredCourseCodes
  requiresAccountManagerVerification
  allowedPriceTierIds
`;

const ADMIN_TICKET_CONFIG_FIELDS = `
  id
  eventId
  enabled
  displayName
  displayEmoji
  description
  transferEligibilityDescription
  transferable
  issueOnEventSubscription
  issueOnMajorEventSubscription
  includedPriceTierIds
  recipientPolicy { ${TICKET_RECIPIENT_POLICY_FIELDS} }
  purchaseEnabled
  purchaseVisibility {
    ${TICKET_RECIPIENT_POLICY_FIELDS}
    requiresValidatedSubscription
  }
  priceOptions { id priceTierId label amountCents }
  expirationMode
  customExpiresAt
  createdAt
  updatedAt
  event { ${TICKET_EVENT_FIELDS} }
  majorEventId
  warnings { code message }
`;

const ADMIN_TICKET_HISTORY_FIELDS = `
  id
  ticketId
  operation
  previousHolder { ${TICKET_PERSON_FIELDS} }
  newHolder { ${TICKET_PERSON_FIELDS} }
  actorName
  reason
  createdAt
`;

const WALLET_TICKET_FIELDS = `
  id
  eventId
  name
  emoji
  description
  transferEligibilityDescription
  status
  transferable
  effectiveExpiresAt
  event { ${TICKET_EVENT_FIELDS} }
  holder { ${TICKET_PERSON_FIELDS} }
`;

const ADMIN_EVENT_TICKET_FIELDS = `
  ${WALLET_TICKET_FIELDS}
  originalHolder { ${TICKET_PERSON_FIELDS} }
  source
  sourceReference
  lastHistoryEntry { ${ADMIN_TICKET_HISTORY_FIELDS} }
`;

const TICKET_TRANSFER_FIELDS = `
  id
  ticket { ${WALLET_TICKET_FIELDS} }
  event { ${TICKET_EVENT_FIELDS} }
  sender { ${TICKET_PERSON_FIELDS} }
  recipient { ${TICKET_PERSON_FIELDS} }
  submittedDestinationIdentityDocument
  senderStatus
  recipientStatus
  ignoreReason
  initiatedByAdmin
  initiatingAdmin { personId firstName avatarUrl }
  createdAt
  updatedAt
  expiresFromListAt
  canCancel
  canAccept
`;
