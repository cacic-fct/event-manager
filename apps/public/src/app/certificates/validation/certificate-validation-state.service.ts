import { Service } from '@angular/core';
import type { PublicCertificateVerification } from '@cacic-fct/event-manager-public-contracts';

/** Briefly preserves results during linked-page navigation; older results require fresh verification. */
@Service()
export class CertificateValidationStateService {
  private readonly certificates = new Map<string, { verification: PublicCertificateVerification; expiresAt: number }>();

  get(certificateId: string): PublicCertificateVerification | undefined {
    const entry = this.certificates.get(certificateId);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.certificates.delete(certificateId);
      return undefined;
    }
    return entry.verification;
  }

  set(certificateId: string, verification: PublicCertificateVerification): void {
    this.certificates.delete(certificateId);
    if (this.certificates.size >= 8) {
      const oldest = this.certificates.keys().next();
      if (!oldest.done) {
        this.certificates.delete(oldest.value);
      }
    }
    this.certificates.set(certificateId, { verification, expiresAt: Date.now() + 5000 });
  }

  clear(certificateId: string): void {
    this.certificates.delete(certificateId);
  }
}
