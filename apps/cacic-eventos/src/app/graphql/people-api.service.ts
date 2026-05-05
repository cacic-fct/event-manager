import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { Person, PersonInput } from './models';
import { PERSON_FIELDS } from './graphql-query-fragments';

@Injectable({ providedIn: 'root' })
export class PeopleApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listPeople(filters?: {
    query?: string;
    userId?: string;
    email?: string;
    phone?: string;
    identityDocument?: string;
    skip?: number;
    take?: number;
  }) {
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
            ${PERSON_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.people));
  }

  createPerson(input: PersonInput) {
    return this.graphqlHttp
      .request<{ createPerson: Person }>(
        `mutation CreatePerson($input: PersonCreateInput!) {
          createPerson(input: $input) {
            ${PERSON_FIELDS}
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
            ${PERSON_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updatePerson));
  }
}