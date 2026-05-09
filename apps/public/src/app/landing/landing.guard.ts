import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-eventos/shared-angular';

/**
 * Guard that redirects authenticated users to /menu.
 * Non-authenticated users are allowed to proceed to landing page.
 */
export const landingGuard = async (): Promise<boolean> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    await router.navigateByUrl('/menu');
    return false;
  }

  return true;
};
