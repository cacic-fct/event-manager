import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  DOWNLOAD_PUBLIC_CERTIFICATE_QUERY,
  PUBLIC_CERTIFICATE_VALIDATION_QUERY,
  type CertificateDownload,
  type DownloadPublicCertificateQuery,
  type GraphqlResponse,
  type GraphqlVariables,
  type PublicCertificateValidation,
  type PublicCertificateValidationQuery,
} from '@cacic-fct/event-manager-public-contracts';
import { Observable, map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CertificateValidationApiService {
  private readonly http = inject(HttpClient);

  validateCertificate(certificateId: string): Observable<PublicCertificateValidation | null> {
    return this.query<PublicCertificateValidationQuery>(PUBLIC_CERTIFICATE_VALIDATION_QUERY, { certificateId }).pipe(
      map((data) => data.publicCertificateValidation),
    );
  }

  downloadCertificate(certificateId: string): Observable<CertificateDownload> {
    return this.query<DownloadPublicCertificateQuery>(DOWNLOAD_PUBLIC_CERTIFICATE_QUERY, { certificateId }).pipe(
      map((data) => data.downloadPublicCertificate),
    );
  }

  private query<TData>(query: string, variables?: GraphqlVariables): Observable<TData> {
    return this.http.post<GraphqlResponse<TData>>('/api/graphql', { query, variables }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors.map((error) => error.message).join('\n'));
        }

        if (!response.data) {
          throw new Error('Resposta GraphQL sem dados.');
        }

        return response.data;
      }),
    );
  }
}
