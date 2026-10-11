import { Service } from '@angular/core';
import type { PublicCertificateValidation } from '@cacic-fct/event-manager-public-contracts';

/** Keeps successful lookups available when returning from linked event pages. */
@Service()
export class CertificateValidationStateService {
  private readonly certificates = new Map<string, PublicCertificateValidation>();

  get(certificateId: string): PublicCertificateValidation | undefined {
    return this.certificates.get(certificateId);
  }

  set(certificateId: string, certificate: PublicCertificateValidation): void {
    this.certificates.set(certificateId, certificate);
  }

  clear(certificateId: string): void {
    this.certificates.delete(certificateId);
  }
}
