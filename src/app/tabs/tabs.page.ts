import { Component } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { getBooleanChanges, RemoteConfig } from '@angular/fire/remote-config';
import { BehaviorSubject, Observable } from 'rxjs';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { trace } from '@angular/fire/compat/performance';
@UntilDestroy()
@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
})
export class TabsPage {
  _allowRestrictedArea: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  allowRestrictedArea$: Observable<boolean> = this._allowRestrictedArea.asObservable();
  readonly manual$: Observable<boolean>;
  readonly events$: Observable<boolean>;
  readonly map$: Observable<boolean>;

  constructor(public auth: AngularFireAuth, private remoteConfig: RemoteConfig) {
    this.auth.idTokenResult.pipe(untilDestroyed(this)).subscribe((idTokenResult) => {
      if (idTokenResult) {
        const claims = idTokenResult.claims;
        if (claims.role < 3000) {
          this._allowRestrictedArea.next(true);
        }
      }
    });

    this.map$ = getBooleanChanges(this.remoteConfig, 'mapTabEnabled').pipe(
      untilDestroyed(this),
      trace('remote-config')
    );
    this.manual$ = getBooleanChanges(this.remoteConfig, 'manualTabEnabled').pipe(
      untilDestroyed(this),
      trace('remote-config')
    );
    this.events$ = getBooleanChanges(this.remoteConfig, 'eventsTabEnabled').pipe(
      untilDestroyed(this),
      trace('remote-config')
    );
  }
}
