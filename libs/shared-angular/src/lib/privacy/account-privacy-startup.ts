import { inject } from '@angular/core';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';

export function initializeCacicAccountPrivacyBestEffort(): void {
  const accountPrivacy = inject(CacicAccountPrivacyService);

  try {
    void accountPrivacy.initialize().catch(() => undefined);
  } catch {
    return;
  }
}
