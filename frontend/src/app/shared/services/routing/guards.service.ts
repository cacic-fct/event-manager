import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { environment } from 'src/environments/environment';
import { redirectUnauthorizedTo, redirectLoggedInTo, customClaims } from '@angular/fire/compat/auth-guard';

import { pipe } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class DevelopmentOnlyGuard {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  canActivate(_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): boolean {
    return !environment.production;
  }
}

// Attribution: waternova
// https://stackoverflow.com/questions/64456664/angularfireauthguard-redirecturl-after-login
export const redirectUnauthorizedToLogin = (_next: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  console.debug('DEBUG: Check redirectUnauthorizedTo');
  return redirectUnauthorizedTo(`/login?redirect=${state.url}`);
};

export const redirectLoggedInToMenu = () => {
  console.debug('DEBUG: Check redirectLoggedInTo menu');
  return redirectLoggedInTo(['/menu']);
};
export const redirectLoggedInToCalendar = () => {
  console.debug('DEBUG: Check redirectLoggedInTo calendar');
  return redirectLoggedInTo(['/calendario']);
};

export const caAndGreater = () =>
  pipe(
    customClaims,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map((claims: Record<string, any>) => (claims['role'] as number) < 3000),
  );

export const adminOnly = () =>
  pipe(
    customClaims,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map((claims: Record<string, any>) => (claims['role'] as number) === 1000),
  );
