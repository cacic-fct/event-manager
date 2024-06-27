import { IonIcon, IonTabs, IonTabBar, IonTabButton, IonLabel } from '@ionic/angular/standalone';
import { Component, WritableSignal, inject, signal } from '@angular/core';
import { getBooleanChanges, RemoteConfig } from '@angular/fire/remote-config';
import { Observable } from 'rxjs';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { trace } from '@angular/fire/compat/performance';
import { Auth, user, getIdTokenResult } from '@angular/fire/auth';
import { AsyncPipe } from '@angular/common';
import { Router } from '@angular/router';

@UntilDestroy()
@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: true,
  imports: [IonLabel, AsyncPipe, IonIcon, IonTabs, IonTabBar, IonTabButton],
})
export class TabsPage {
  private remoteConfig: RemoteConfig = inject(RemoteConfig);

  private auth: Auth = inject(Auth);
  user$ = user(this.auth);
  public router = inject(Router);

  public regex = new RegExp(/^\/{1}(#{1}.*|#?)$/g);

  allowRestrictedArea: WritableSignal<boolean> = signal(false);
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
              this.allowRestrictedArea.set(true);
            }
          }
        });
      } else {
        this.allowRestrictedArea.set(false);
      }
    });

    this.map$ = getBooleanChanges(this.remoteConfig, 'mapTabEnabled').pipe(
      untilDestroyed(this),
      trace('remote-config'),
    );
    this.manual$ = getBooleanChanges(this.remoteConfig, 'manualTabEnabled').pipe(
      untilDestroyed(this),
      trace('remote-config'),
    );
    this.events$ = getBooleanChanges(this.remoteConfig, 'eventsTabEnabled').pipe(
      untilDestroyed(this),
      trace('remote-config'),
    );
  }
}
