import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import {
  DeletionResult,
  MergeCandidate,
  MergeCandidateStatus,
  PersonMergeField,
} from './models';
import { PERSON_FIELDS } from './graphql-query-fragments';

@Injectable({ providedIn: 'root' })
export class MergeCandidateApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listMergeCandidates(filters?: {
    status?: MergeCandidateStatus;
    skip?: number;
    take?: number;
  }) {
    return this.graphqlHttp
      .request<{ mergeCandidates: MergeCandidate[] }>(
        `query ListMergeCandidates(
          $status: MergeCandidateStatus
          $skip: Int
          $take: Int
        ) {
          mergeCandidates(status: $status, skip: $skip, take: $take) {
            id
            personAId
            personBId
            pairKey
            score
            matchMethod
            matchValue
            status
            resolvedById
            createdAt
            updatedAt
            personA {
              ${PERSON_FIELDS}
            }
            personB {
              ${PERSON_FIELDS}
            }
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.mergeCandidates));
  }

  updateMergeCandidate(id: string, input: { status: MergeCandidateStatus }) {
    return this.graphqlHttp
      .request<{ updateMergeCandidate: MergeCandidate }>(
        `mutation UpdateMergeCandidate(
          $id: String!
          $input: MergeCandidateUpdateInput!
        ) {
          updateMergeCandidate(id: $id, input: $input) {
            id
            status
            updatedAt
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updateMergeCandidate));
  }

  deleteMergeCandidate(id: string) {
    return this.graphqlHttp
      .request<{ deleteMergeCandidate: DeletionResult }>(
        `mutation DeleteMergeCandidate($id: String!) {
          deleteMergeCandidate(id: $id) {
            deleted
            id
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.deleteMergeCandidate));
  }

  scanMergeCandidates() {
    return this.graphqlHttp
      .request<{ scanMergeCandidates: number }>(
        `mutation ScanMergeCandidates {
          scanMergeCandidates
        }`,
      )
      .pipe(map((data) => data.scanMergeCandidates));
  }

  mergeCandidatePeople(input: {
    candidateId: string;
    targetPersonId: string;
    migrateFields?: PersonMergeField[];
  }) {
    return this.graphqlHttp
      .request<{ mergeCandidatePeople: MergeCandidate }>(
        `mutation MergeCandidatePeople($input: MergeCandidateMergeInput!) {
          mergeCandidatePeople(input: $input) {
            id
            status
            updatedAt
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.mergeCandidatePeople));
  }

  undoMergeCandidatePeople(candidateId: string) {
    return this.graphqlHttp
      .request<{ undoMergeCandidatePeople: MergeCandidate }>(
        `mutation UndoMergeCandidatePeople($candidateId: String!) {
          undoMergeCandidatePeople(candidateId: $candidateId) {
            id
            status
            updatedAt
          }
        }`,
        { candidateId },
      )
      .pipe(map((data) => data.undoMergeCandidatePeople));
  }
}