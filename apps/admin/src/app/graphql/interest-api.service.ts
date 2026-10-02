import { Service, inject } from '@angular/core';
import { map } from 'rxjs';
import {
  InterestTargetType,
  type InterestTargetType as InterestTargetTypeValue,
} from '@cacic-fct/shared-event-participation';
import { GraphqlHttpService } from './graphql-http.service';

export interface AdminEventInterestPerson {
  id: string;
  name: string;
  email?: string | null;
}

export interface AdminEventInterest {
  id: string;
  personId: string;
  person?: AdminEventInterestPerson | null;
  targetType: InterestTargetTypeValue;
  targetId: string;
  eventId?: string | null;
  eventGroupId?: string | null;
  majorEventId?: string | null;
  isSubscribed?: boolean;
  createdAt: string;
  updatedAt: string;
  createdById?: string | null;
}

export interface AdminEventInterestConversion {
  interest: AdminEventInterest;
  personId: string;
  subscriptionId?: string | null;
  eventSubscriptionId?: string | null;
  eventGroupSubscriptionId?: string | null;
  majorEventSubscriptionId?: string | null;
  subscriptionStatus?: string | null;
}

export interface ConvertEventInterestInput {
  interestId: string;
  selectedEventIds?: string[] | null;
  subscriptionStatus?: string | null;
  amountPaid?: number | null;
  paymentDate?: string | null;
  paymentTier?: string | null;
  imageLicenseAgreementAccepted?: boolean | null;
}

const EVENT_INTEREST_FIELDS = `
  id
  personId
  person { id name email }
  targetType
  targetId
  eventId
  eventGroupId
  majorEventId
  isSubscribed
  createdAt
  updatedAt
  createdById
`;

@Service()
export class InterestApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listInterests(
    targetType: InterestTargetTypeValue,
    targetId: string,
    filters?: { query?: string; skip?: number; take?: number },
  ) {
    return this.graphqlHttp
      .request<{ eventInterests: AdminEventInterest[] }>(
        `query AdminEventInterests(
          $targetType: InterestTargetType!
          $targetId: String!
          $query: String
          $skip: Int
          $take: Int
        ) {
          eventInterests(
            targetType: $targetType
            targetId: $targetId
            query: $query
            skip: $skip
            take: $take
          ) {
            ${EVENT_INTEREST_FIELDS}
          }
        }`,
        {
          targetType,
          targetId,
          query: filters?.query,
          skip: filters?.skip,
          take: filters?.take,
        },
      )
      .pipe(map((data) => data.eventInterests));
  }

  countInterests(targetType: InterestTargetTypeValue, targetId: string, query?: string) {
    return this.graphqlHttp
      .request<{ eventInterestCount: number }>(
        `query EventInterestCount($targetType: InterestTargetType!, $targetId: String!, $query: String) {
          eventInterestCount(targetType: $targetType, targetId: $targetId, query: $query)
        }`,
        { targetType, targetId, query },
      )
      .pipe(map((data) => data.eventInterestCount));
  }

  convertInterestToSubscription(input: ConvertEventInterestInput) {
    return this.graphqlHttp
      .request<{ convertEventInterestToSubscription: AdminEventInterestConversion }>(
        `mutation ConvertEventInterestToSubscription($input: ConvertEventInterestToSubscriptionInput!) {
          convertEventInterestToSubscription(input: $input) {
            interest {
              ${EVENT_INTEREST_FIELDS}
            }
            personId
            subscriptionId
            eventSubscriptionId
            eventGroupSubscriptionId
            majorEventSubscriptionId
            subscriptionStatus
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.convertEventInterestToSubscription));
  }
}

export { InterestTargetType };
