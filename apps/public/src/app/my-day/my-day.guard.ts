import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';

export const myDayFeatureGuard: CanActivateFn = () => {
  const flags = inject(PublicFeatureFlagService);
  const router = inject(Router);
  return flags.booleanValue('myDayTabEnabled') ? true : router.createUrlTree(['/calendar']);
};
