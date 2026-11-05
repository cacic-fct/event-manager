import { HttpClient, HttpResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import {
  DOWNLOAD_PUBLIC_CERTIFICATE_QUERY,
  PUBLIC_CERTIFICATE_VERIFICATION_QUERY,
  REQUEST_PUBLIC_CERTIFICATE_PREVIEW_MUTATION,
  type CertificateDownload,
  type DownloadPublicCertificateQuery,
  type GraphqlResponse,
  type GraphqlVariables,
  type PublicCertificateVerification,
  type PublicCertificatePreview,
  type PublicCertificateVerificationQuery,
} from '@cacic-fct/event-manager-public-contracts';
import { Observable, map } from 'rxjs';
import { graphqlError } from '../../shared/rate-limit-error';

@Service()
export class CertificateValidationApiService {
  private readonly http = inject(HttpClient);

  validateCertificate(certificateId: string, turnstileToken: string): Observable<PublicCertificateVerification> {
    return this.query<PublicCertificateVerificationQuery>(PUBLIC_CERTIFICATE_VERIFICATION_QUERY, {
      certificateId,
      turnstileToken,
    }).pipe(map((data) => data.publicCertificateVerification));
  }

  validateCertificatePdf(
    file: File,
    turnstileToken: string,
  ): Observable<PublicCertificateVerification & { certificateId: string }> {
    return this.http.post<PublicCertificateVerification & { certificateId: string }>(
      '/api/certificates/validate/pdf',
      file,
      { headers: { 'Content-Type': 'application/pdf', 'X-Turnstile-Token': turnstileToken } },
    );
  }

  downloadCertificate(certificateId: string): Observable<CertificateDownload> {
    return this.query<DownloadPublicCertificateQuery>(DOWNLOAD_PUBLIC_CERTIFICATE_QUERY, { certificateId }).pipe(
      map((data) => data.downloadPublicCertificate),
    );
  }

  requestPreview(certificateId: string, previewToken: string): Observable<PublicCertificatePreview | null> {
    return this.query<{ requestPublicCertificatePreview: PublicCertificatePreview | null }>(
      REQUEST_PUBLIC_CERTIFICATE_PREVIEW_MUTATION,
      { certificateId, previewToken },
    ).pipe(map((data) => data.requestPublicCertificatePreview));
  }

  previewCertificate(imagePath: string, previewToken: string): Observable<HttpResponse<Blob>> {
    return this.http.get(imagePath, {
      headers: { 'X-Certificate-Preview-Token': previewToken },
      observe: 'response',
      responseType: 'blob',
    });
  }

  private query<TData>(query: string, variables?: GraphqlVariables): Observable<TData> {
    return this.http.post<GraphqlResponse<TData>>('/api/graphql', { query, variables }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw graphqlError(response.errors);
        }

        if (!response.data) {
          throw new Error('Resposta GraphQL sem dados.');
        }

        return response.data;
      }),
    );
  }
}
