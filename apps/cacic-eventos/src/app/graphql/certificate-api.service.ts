import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import {
  Certificate,
  CertificateConfig,
  CertificateConfigInput,
  CertificateDownload,
  CertificateScope,
  CertificateTemplate,
  Event,
  EventGroup,
  MajorEvent,
} from './models';
import {
  CERTIFICATE_CONFIG_FIELDS,
  CERTIFICATE_DOWNLOAD_FIELDS,
  CERTIFICATE_FIELDS,
  CERTIFICATE_TEMPLATE_FIELDS,
  EVENT_FIELDS,
  EVENT_GROUP_FIELDS,
  MAJOR_EVENT_FIELDS,
} from './graphql-query-fragments';

@Injectable({ providedIn: 'root' })
export class CertificateApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listCertificateIssuableEvents(filters?: {
    query?: string;
    skip?: number;
    take?: number;
  }) {
    return this.graphqlHttp
      .request<{ certificateIssuableEvents: Event[] }>(
        `query ListCertificateIssuableEvents(
          $query: String
          $skip: Int
          $take: Int
        ) {
          certificateIssuableEvents(query: $query, skip: $skip, take: $take) {
            ${EVENT_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.certificateIssuableEvents));
  }

  listCertificateIssuableEventGroups(filters?: {
    query?: string;
    skip?: number;
    take?: number;
  }) {
    return this.graphqlHttp
      .request<{ certificateIssuableEventGroups: EventGroup[] }>(
        `query ListCertificateIssuableEventGroups(
          $query: String
          $skip: Int
          $take: Int
        ) {
          certificateIssuableEventGroups(query: $query, skip: $skip, take: $take) {
            ${EVENT_GROUP_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.certificateIssuableEventGroups));
  }

  listCertificateIssuableMajorEvents(filters?: {
    query?: string;
    skip?: number;
    take?: number;
  }) {
    return this.graphqlHttp
      .request<{ certificateIssuableMajorEvents: MajorEvent[] }>(
        `query ListCertificateIssuableMajorEvents(
          $query: String
          $skip: Int
          $take: Int
        ) {
          certificateIssuableMajorEvents(query: $query, skip: $skip, take: $take) {
            ${MAJOR_EVENT_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.certificateIssuableMajorEvents));
  }

  listCertificateTemplates(filters?: {
    query?: string;
    includeInactive?: boolean;
    skip?: number;
    take?: number;
  }) {
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