import { effect, inject } from '@angular/core';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';
import { AuthService } from '../auth/auth.service';

export function initializeCacicAccountPrivacyBestEffort(): void {
  const accountPrivacy = inject(CacicAccountPrivacyService);
  const auth = inject(AuthService);
  let started = false;

  effect(() => {
    if (started || !auth.initialized() || !auth.isAuthenticated()) {
      return;
    }

    started = true;

    try {
      void accountPrivacy.initialize().catch(() => undefined);
    } catch {
      return;
    }
  });
}
