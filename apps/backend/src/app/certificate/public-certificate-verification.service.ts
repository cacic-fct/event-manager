import type { PublicCertificateVerification } from '@cacic-fct/shared-data-types';
import { Injectable } from '@nestjs/common';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { isCertificatePreviewId } from './certificate-preview-source';
import { CertificatePreviewService } from './certificate-preview.service';
import { PublicCertificateValidationService } from './public-certificate-validation.service';

@Injectable()
export class PublicCertificateVerificationService {
  constructor(
    private readonly validation: PublicCertificateValidationService,
    private readonly previews: CertificatePreviewService,
  ) {}

  verify(certificateId: string): Promise<PublicCertificateVerification> {
    const id = certificateId.trim();
    if (!isCertificatePreviewId(id)) {
      return Promise.resolve({ certificate: null, revokedAt: null, previewToken: null });
    }
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const certificate = await this.validation.validateCertificate(id);
      if (!certificate) {
        return { certificate: null, revokedAt: await this.validation.findPublicRevocation(id), previewToken: null };
      }
      return { certificate, revokedAt: null, previewToken: this.previews.createToken(certificate) };
    });
  }
}
