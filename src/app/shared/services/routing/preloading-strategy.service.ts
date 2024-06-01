import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PreloadingStrategyService implements PreloadingStrategy {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preload(route: Route, fn: () => Observable<any>): Observable<null> {
    if (route.data && route.data['preload']) {
      return fn();
    }
    return of(null);
  }
}
