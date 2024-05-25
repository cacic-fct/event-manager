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
  canActivate(_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): boolean {
    return !environment.production;
  }
}

// Attribution: waternova
// https://stackoverflow.com/questions/64456664/angularfireauthguard-redirecturl-after-login
export const redirectUnauthorizedToLogin = (_next: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  return redirectUnauthorizedTo(`/login?redirect=${state.url}`);
};

export const redirectLoggedInToMenu = () => redirectLoggedInTo(['menu']);
export const redirectLoggedInToCalendar = () => redirectLoggedInTo(['calendario']);

export const caAndGreater = () =>
  pipe(
    customClaims,
    map((claims: { [key: string]: any }) => (claims['role'] as number) < 3000),
  );

export const adminOnly = () =>
  pipe(
    customClaims,
    map((claims: { [key: string]: any }) => (claims['role'] as number) === 1000),
  );
