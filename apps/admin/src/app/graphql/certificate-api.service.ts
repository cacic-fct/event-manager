import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import {
  Certificate,
  CertificateCsvImportResolution,
  CertificateCsvImportResult,
  CertificateConfig,
  CertificateConfigCloneInput,
  CertificateConfigInput,
  CertificateDownload,
  CertificateFolder,
  CertificateFolderInput,
  CertificateReissueResult,
  CertificateScope,
  CertificateTemplate,
  DeletionResult,
  Event,
  EventGroup,
  MajorEvent,
} from '@cacic-fct/event-manager-admin-contracts';
import {
  CERTIFICATE_CONFIG_FIELDS,
  CERTIFICATE_DOWNLOAD_FIELDS,
  CERTIFICATE_FIELDS,
  CERTIFICATE_FOLDER_FIELDS,
  CERTIFICATE_TEMPLATE_FIELDS,
  EVENT_CERTIFICATE_TARGET_FIELDS,
  EVENT_GROUP_CERTIFICATE_TARGET_FIELDS,
  MAJOR_EVENT_CERTIFICATE_TARGET_FIELDS,
} from './graphql-query-fragments';

@Injectable({ providedIn: 'root' })
export class CertificateApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listCertificateIssuableEvents(filters?: { query?: string; skip?: number; take?: number }) {
    return this.graphqlHttp
      .request<{ certificateIssuableEvents: Event[] }>(
        `query ListCertificateIssuableEvents(
          $query: String
          $skip: Int
          $take: Int
        ) {
          certificateIssuableEvents(query: $query, skip: $skip, take: $take) {
            ${EVENT_CERTIFICATE_TARGET_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.certificateIssuableEvents));
  }

  listCertificateIssuableEventGroups(filters?: { query?: string; skip?: number; take?: number }) {
    return this.graphqlHttp
      .request<{ certificateIssuableEventGroups: EventGroup[] }>(
        `query ListCertificateIssuableEventGroups(
          $query: String
          $skip: Int
          $take: Int
        ) {
          certificateIssuableEventGroups(query: $query, skip: $skip, take: $take) {
            ${EVENT_GROUP_CERTIFICATE_TARGET_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.certificateIssuableEventGroups));
  }

  listCertificateIssuableMajorEvents(filters?: { query?: string; skip?: number; take?: number }) {
    return this.graphqlHttp
      .request<{ certificateIssuableMajorEvents: MajorEvent[] }>(
        `query ListCertificateIssuableMajorEvents(
          $query: String
          $skip: Int
          $take: Int
        ) {
          certificateIssuableMajorEvents(query: $query, skip: $skip, take: $take) {
            ${MAJOR_EVENT_CERTIFICATE_TARGET_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.certificateIssuableMajorEvents));
  }

  listCertificateFolders(filters?: { query?: string; skip?: number; take?: number }) {
    return this.graphqlHttp
      .request<{ certificateFolders: CertificateFolder[] }>(
        `query ListCertificateFolders(
          $query: String
          $skip: Int
          $take: Int
        ) {
          certificateFolders(query: $query, skip: $skip, take: $take) {
            ${CERTIFICATE_FOLDER_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.certificateFolders));
  }

  getCertificateFolder(id: string) {
    return this.graphqlHttp
      .request<{ certificateFolder: CertificateFolder }>(
        `query CertificateFolder($id: String!) {
          certificateFolder(id: $id) {
            ${CERTIFICATE_FOLDER_FIELDS}
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.certificateFolder));
  }

  listCertificateTemplates(filters?: { query?: string; includeInactive?: boolean; skip?: number; take?: number }) {
    return this.graphqlHttp
      .request<{ certificateTemplates: CertificateTemplate[] }>(
        `query ListCertificateTemplates(
          $query: String
          $includeInactive: Boolean
          $skip: Int
          $take: Int
        ) {
          certificateTemplates(
            query: $query
            includeInactive: $includeInactive
            skip: $skip
            take: $take
          ) {
            ${CERTIFICATE_TEMPLATE_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.certificateTemplates));
  }

  listCertificateConfigs(
    scope: CertificateScope,
    targetId: string,
    filters?: {
      includeInactive?: boolean;
      skip?: number;
      take?: number;
    },
  ) {
    return this.graphqlHttp
      .request<{ certificateConfigs: CertificateConfig[] }>(
        `query ListCertificateConfigs(
          $scope: CertificateScope!
          $targetId: String!
          $includeInactive: Boolean
          $skip: Int
          $take: Int
        ) {
          certificateConfigs(
            scope: $scope
            targetId: $targetId
            includeInactive: $includeInactive
            skip: $skip
            take: $take
          ) {
            ${CERTIFICATE_CONFIG_FIELDS}
          }
        }`,
        {
          scope,
          targetId,
          includeInactive: filters?.includeInactive,
          skip: filters?.skip,
          take: filters?.take,
        },
      )
      .pipe(map((data) => data.certificateConfigs));
  }

  listCertificates(
    scope: CertificateScope,
    targetId: string,
    filters?: {
      configId?: string;
      skip?: number;
      take?: number;
    },
  ) {
    return this.graphqlHttp
      .request<{ certificates: Certificate[] }>(
        `query ListCertificates(
          $scope: CertificateScope!
          $targetId: String!
          $configId: String
          $skip: Int
          $take: Int
        ) {
          certificates(
            scope: $scope
            targetId: $targetId
            configId: $configId
            skip: $skip
            take: $take
          ) {
            ${CERTIFICATE_FIELDS}
          }
        }`,
        {
          scope,
          targetId,
          configId: filters?.configId,
          skip: filters?.skip,
          take: filters?.take,
        },
      )
      .pipe(map((data) => data.certificates));
  }

  createCertificateConfig(input: CertificateConfigInput) {
    return this.graphqlHttp
      .request<{ createCertificateConfig: CertificateConfig }>(
        `mutation CreateCertificateConfig($input: CertificateConfigCreateInput!) {
          createCertificateConfig(input: $input) {
            ${CERTIFICATE_CONFIG_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createCertificateConfig));
  }

  createCertificateFolder(input: CertificateFolderInput) {
    return this.graphqlHttp
      .request<{ createCertificateFolder: CertificateFolder }>(
        `mutation CreateCertificateFolder($input: CertificateFolderCreateInput!) {
          createCertificateFolder(input: $input) {
            ${CERTIFICATE_FOLDER_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createCertificateFolder));
  }

  updateCertificateFolder(id: string, input: CertificateFolderInput) {
    return this.graphqlHttp
      .request<{ updateCertificateFolder: CertificateFolder }>(
        `mutation UpdateCertificateFolder(
          $id: String!
          $input: CertificateFolderUpdateInput!
        ) {
          updateCertificateFolder(id: $id, input: $input) {
            ${CERTIFICATE_FOLDER_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updateCertificateFolder));
  }

  deleteCertificateFolder(id: string) {
    return this.graphqlHttp
      .request<{ deleteCertificateFolder: DeletionResult }>(
        `mutation DeleteCertificateFolder($id: String!) {
          deleteCertificateFolder(id: $id) {
            id
            deleted
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.deleteCertificateFolder));
  }

  updateCertificateConfig(id: string, input: CertificateConfigInput) {
    return this.graphqlHttp
      .request<{ updateCertificateConfig: CertificateConfig }>(
        `mutation UpdateCertificateConfig(
          $id: String!
          $input: CertificateConfigUpdateInput!
        ) {
          updateCertificateConfig(id: $id, input: $input) {
            ${CERTIFICATE_CONFIG_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updateCertificateConfig));
  }

  cloneCertificateConfig(id: string, input: CertificateConfigCloneInput) {
    return this.graphqlHttp
      .request<{ cloneCertificateConfig: CertificateConfig }>(
        `mutation CloneCertificateConfig(
          $id: String!
          $input: CertificateConfigCloneInput
        ) {
          cloneCertificateConfig(id: $id, input: $input) {
            ${CERTIFICATE_CONFIG_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.cloneCertificateConfig));
  }

  deleteCertificateConfig(id: string) {
    return this.graphqlHttp
      .request<{ deleteCertificateConfig: DeletionResult }>(
        `mutation DeleteCertificateConfig($id: String!) {
          deleteCertificateConfig(id: $id) {
            deleted
            id
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.deleteCertificateConfig));
  }

  issueCertificateForPerson(configId: string, personId: string) {
    return this.graphqlHttp
      .request<{ issueCertificateForPerson: Certificate }>(
        `mutation IssueCertificateForPerson(
          $configId: String!
          $personId: String!
        ) {
          issueCertificateForPerson(configId: $configId, personId: $personId) {
            ${CERTIFICATE_FIELDS}
          }
        }`,
        { configId, personId },
      )
      .pipe(map((data) => data.issueCertificateForPerson));
  }

  issueManualCertificatesFromCsv(input: {
    configId: string;
    csvContent: string;
    selectedHeader: string;
    resolutions?: CertificateCsvImportResolution[];
  }) {
    return this.graphqlHttp
      .request<{ issueManualCertificatesFromCsv: CertificateCsvImportResult }>(
        `mutation IssueManualCertificatesFromCsv($input: CertificateCsvImportInput!) {
          issueManualCertificatesFromCsv(input: $input) {
            createdCount
            duplicateCount
            failedCount
            failedValues
            inferredMatchType
            ambiguousValues {
              value
              candidates {
                id
                name
              }
            }
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.issueManualCertificatesFromCsv));
  }

  issueMissedCertificates(configId: string) {
    return this.graphqlHttp
      .request<{ issueMissedCertificates: Certificate[] }>(
        `mutation IssueMissedCertificates($configId: String!) {
          issueMissedCertificates(configId: $configId) {
            ${CERTIFICATE_FIELDS}
          }
        }`,
        { configId },
      )
      .pipe(map((data) => data.issueMissedCertificates));
  }

  reissueAllCertificates() {
    return this.graphqlHttp
      .request<{ reissueAllCertificates: CertificateReissueResult }>(
        `mutation ReissueAllCertificates {
          reissueAllCertificates {
            configCount
            certificateCount
          }
        }`,
      )
      .pipe(map((data) => data.reissueAllCertificates));
  }

  deleteCertificate(id: string) {
    return this.graphqlHttp
      .request<{ deleteCertificate: DeletionResult }>(
        `mutation DeleteCertificate($id: String!) {
          deleteCertificate(id: $id) {
            deleted
            id
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.deleteCertificate));
  }

  downloadCertificate(certificateId: string) {
    return this.graphqlHttp
      .request<{ downloadCertificate: CertificateDownload }>(
        `query DownloadCertificate($certificateId: String!) {
          downloadCertificate(certificateId: $certificateId) {
            ${CERTIFICATE_DOWNLOAD_FIELDS}
          }
        }`,
        { certificateId },
      )
      .pipe(map((data) => data.downloadCertificate));
  }
}
