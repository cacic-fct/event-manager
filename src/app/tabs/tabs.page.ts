import { IonIcon, IonTabs, IonTabBar, IonTabButton } from '@ionic/angular/standalone';
import { Component, inject } from '@angular/core';
import { getBooleanChanges, RemoteConfig } from '@angular/fire/remote-config';
import { BehaviorSubject, Observable } from 'rxjs';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { trace } from '@angular/fire/compat/performance';
import { Auth, user, getIdTokenResult } from '@angular/fire/auth';
import { AsyncPipe } from '@angular/common';

@UntilDestroy()
@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: true,
  imports: [AsyncPipe, IonIcon, IonTabs, IonTabBar, IonTabButton],
})
export class TabsPage {
  private remoteConfig: RemoteConfig = inject(RemoteConfig);

  private auth: Auth = inject(Auth);
  user$ = user(this.auth);

  _allowRestrictedArea: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  allowRestrictedArea$: Observable<boolean> = this._allowRestrictedArea.asObservable();
  readonly manual$: Observable<boolean>;
  readonly events$: Observable<boolean>;
  readonly map$: Observable<boolean>;

  constructor() {
    this.user$.pipe(untilDestroyed(this), trace('auth')).subscribe((user) => {
      if (user) {
        getIdTokenResult(user).then((idTokenResult) => {
          if (idTokenResult) {
            const claims = idTokenResult.claims;
            if ((claims['role'] as number) < 3000) {
              this._allowRestrictedArea.next(true);
            }
          }
        });
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
