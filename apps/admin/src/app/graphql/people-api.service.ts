import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import {
  DeletionResult,
  LecturerProfile,
  LecturerProfileInput,
  Person,
  PersonInput,
  PersonLinkedDataSummary,
  PersonLinkedResourcePage,
} from '@cacic-fct/event-manager-admin-contracts';
import { PERSON_DETAIL_FIELDS, PERSON_SEARCH_FIELDS } from './graphql-query-fragments';

type PeopleFilters = {
  query?: string;
  userId?: string;
  email?: string;
  phone?: string;
  identityDocument?: string;
  skip?: number;
  take?: number;
};

@Injectable({ providedIn: 'root' })
export class PeopleApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listPeople(filters?: PeopleFilters) {
    return this.graphqlHttp
      .request<{ people: Person[] }>(
        `query ListPeople(
          $query: String
          $userId: String
          $email: String
          $phone: String
          $identityDocument: String
          $skip: Int
          $take: Int
        ) {
          people(
            query: $query
            userId: $userId
            email: $email
            phone: $phone
            identityDocument: $identityDocument
            skip: $skip
            take: $take
          ) {
            ${PERSON_DETAIL_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.people));
  }

  listPeopleSummaries(filters?: PeopleFilters) {
    return this.graphqlHttp
      .request<{ people: Person[] }>(
        `query ListPeopleSummaries(
          $query: String
          $userId: String
          $email: String
          $phone: String
          $identityDocument: String
          $skip: Int
          $take: Int
        ) {
          people(
            query: $query
            userId: $userId
            email: $email
            phone: $phone
            identityDocument: $identityDocument
            skip: $skip
            take: $take
          ) {
            ${PERSON_SEARCH_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.people));
  }

  getPerson(id: string) {
    return this.graphqlHttp
      .request<{ person: Person }>(
        `query GetPerson($id: String!) {
          person(id: $id) {
            ${PERSON_DETAIL_FIELDS}
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.person));
  }

  createPerson(input: PersonInput) {
    return this.graphqlHttp
      .request<{ createPerson: Person }>(
        `mutation CreatePerson($input: PersonCreateInput!) {
          createPerson(input: $input) {
            ${PERSON_DETAIL_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createPerson));
  }

  updatePerson(id: string, input: PersonInput) {
    return this.graphqlHttp
      .request<{ updatePerson: Person }>(
        `mutation UpdatePerson($id: String!, $input: PersonUpdateInput!) {
          updatePerson(id: $id, input: $input) {
            ${PERSON_DETAIL_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updatePerson));
  }

  getLecturerProfile(personId: string) {
    return this.graphqlHttp
      .request<{ lecturerProfile: LecturerProfile | null }>(
        `query GetLecturerProfile($personId: String!) {
          lecturerProfile(personId: $personId) {
            ${LECTURER_PROFILE_FIELDS}
          }
        }`,
        { personId },
      )
      .pipe(map((data) => data.lecturerProfile));
  }

  upsertLecturerProfile(personId: string, input: LecturerProfileInput) {
    return this.graphqlHttp
      .request<{ upsertLecturerProfile: LecturerProfile }>(
        `mutation UpsertLecturerProfile($personId: String!, $input: LecturerProfileUpsertInput!) {
          upsertLecturerProfile(personId: $personId, input: $input) {
            ${LECTURER_PROFILE_FIELDS}
          }
        }`,
        { personId, input },
      )
      .pipe(map((data) => data.upsertLecturerProfile));
  }

  getPersonLinkedDataSummary(id: string) {
    return this.graphqlHttp
      .request<{ personLinkedDataSummary: PersonLinkedDataSummary }>(
        `query PersonLinkedDataSummary($id: String!) {
          personLinkedDataSummary(id: $id) {
            personId
            totalCount
            hasLinkedData
            canDelete
            groups {
              type
              label
              icon
              totalCount
            }
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.personLinkedDataSummary));
  }

  getPersonLinkedResources(personId: string, type: string, skip: number, take: number) {
    return this.graphqlHttp
      .request<{ personLinkedResources: PersonLinkedResourcePage }>(
        `query PersonLinkedResources($personId: String!, $type: String!, $skip: Int, $take: Int) {
          personLinkedResources(personId: $personId, type: $type, skip: $skip, take: $take) {
            personId
            type
            label
            icon
            total
            skip
            take
            items {
              id
              label
              description
              route
              status
              occurredAt
            }
          }
        }`,
        { personId, type, skip, take },
      )
      .pipe(map((data) => data.personLinkedResources));
  }

  deletePerson(id: string) {
    return this.graphqlHttp
      .request<{ deletePerson: DeletionResult }>(
        `mutation DeletePerson($id: String!) {
          deletePerson(id: $id) {
            deleted
            id
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.deletePerson));
  }
}

const LECTURER_PROFILE_FIELDS = `
  id
  personId
  displayName
  biography
  publishGoogleUserPicture
  googleUserPicture
  email
  whatsapp
  createdAt
  createdById
  updatedAt
  updatedById
`;
