import { Injectable } from '@angular/core';
import { CanLoad, Route, UrlSegment, UrlTree, Router } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { Observable } from 'rxjs';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { take, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanLoad {
  constructor(
    public authService: AuthService,
    public router: Router,
    public auth: AngularFireAuth
  ) {}
  canLoad(
    route: Route,
    segments: UrlSegment[]
  ):
    | Observable<boolean | UrlTree>
    | Promise<boolean | UrlTree>
    | boolean
    | UrlTree {
    return this.performCheck();
  }

  private performCheck(): Observable<boolean> {
    return this.auth.user.pipe(
      map((user) => {
        if (user) {
          return true;
        }
        //this.router.navigate(['login']);
        return false;
      }),
      take(1)
    );
  }
}
