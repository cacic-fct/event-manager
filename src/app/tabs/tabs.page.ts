import { Component } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFireRemoteConfig } from '@angular/fire/compat/remote-config';
import { Observable } from 'rxjs';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
@UntilDestroy()
@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
})
export class TabsPage {
  isAdmin: boolean = false;
  readonly manual$: Observable<boolean>;

  constructor(public auth: AngularFireAuth, public remoteConfig: AngularFireRemoteConfig) {
    this.auth.idTokenResult.pipe(untilDestroyed(this)).subscribe((idTokenResult) => {
      if (idTokenResult === null) {
        this.isAdmin = false;
        return;
      }

      const claims = idTokenResult.claims;
      if (claims.role === 1000) {
        this.isAdmin = true;
      }
    });

    this.manual$ = this.remoteConfig.booleans.manualTabEnabled;
  }
}
