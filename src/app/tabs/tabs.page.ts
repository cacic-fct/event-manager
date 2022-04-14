import { Component } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { trace } from '@angular/fire/compat/performance';
import {
  AngularFireRemoteConfig,
  filterFresh,
  mapToObject,
  scanToObject,
} from '@angular/fire/compat/remote-config';
import { first, Observable } from 'rxjs';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
})
export class TabsPage {
  isAdmin: boolean = false;
  readonly manual$: Observable<boolean>;

  constructor(
    public auth: AngularFireAuth,
    public remoteConfig: AngularFireRemoteConfig
  ) {
    this.auth.idTokenResult.subscribe((idTokenResult) => {
      if (idTokenResult === null) {
        this.isAdmin = false;
        return;
      }

      const claims = idTokenResult.claims;
      if (claims.admin) {
        this.isAdmin = true;
      }
    });

    this.manual$ = this.remoteConfig.booleans.manualTabEnabled;
  }
}
