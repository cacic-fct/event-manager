import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CertificateDownload,
  PublicCertificateValidation,
} from '@cacic-eventos/shared-utils';
import { Observable, map } from 'rxjs';

type GraphqlVariable = string | number | boolean | null | undefined;
type GraphqlVariables = Record<string, GraphqlVariable>;

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

const CERTIFICATE_VALIDATION_FIELDS = `
  id
  issuedAt
  personName
  maskedIdentityDocument
  scope
  certificateName
  targetName
  targetEmoji
  totalCreditMinutes
  sections {
    title
    type
    creditMinutes
    events {
      name
      emoji
      startDate
      endDate
      creditMinutes
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class CertificateValidationApiService {
  private readonly http = inject(HttpClient);

  validateCertificate(
    certificateId: string,
  ): Observable<PublicCertificateValidation | null> {
    return this.query<{
      publicCertificateValidation: PublicCertificateValidation | null;
    }>(
      `
        query PublicCertificateValidation($certificateId: String!) {
          publicCertificateValidation(certificateId: $certificateId) {
            ${CERTIFICATE_VALIDATION_FIELDS}
          }
        }
      `,
      { certificateId },
    ).pipe(map((data) => data.publicCertificateValidation));
  }

  downloadCertificate(certificateId: string): Observable<CertificateDownload> {
    return this.query<{ downloadPublicCertificate: CertificateDownload }>(
      `
        query DownloadPublicCertificate($certificateId: String!) {
          downloadPublicCertificate(certificateId: $certificateId) {
            fileName
            mimeType
            contentBase64
          }
        }
      `,
      { certificateId },
    ).pipe(map((data) => data.downloadPublicCertificate));
  }

  private query<TData>(
    query: string,
    variables?: GraphqlVariables,
  ): Observable<TData> {
    return this.http
      .post<GraphqlResponse<TData>>('/api/graphql', { query, variables })
      .pipe(
        map((response) => {
          if (response.errors?.length) {
            throw new Error(
              response.errors.map((error) => error.message).join('\n'),
            );
          }

          if (!response.data) {
            throw new Error('Resposta GraphQL sem dados.');
          }

          return response.data;
        }),
      );
  }
}
