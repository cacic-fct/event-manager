import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { authGuard } from '@cacic-fct/shared-angular';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';

export const myDayFeatureGuard: CanActivateFn = async (route, state) => {
  const flags = inject(PublicFeatureFlagService);
  const errors = inject(RouteErrorService);
  const authResult = await authGuard(route, state);
  if (authResult !== true) return authResult;

  return flags.booleanValue('myDayTabEnabled') ? true : errors.guardRedirect(404);
};
