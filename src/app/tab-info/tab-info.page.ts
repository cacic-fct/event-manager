import { Component } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { AuthService } from '../shared/services/auth.service';
import firebase from 'firebase/compat/app';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
@UntilDestroy()
@Component({
  selector: 'app-tab3',
  templateUrl: 'tab-info.page.html',
  styleUrls: ['tab-info.page.scss'],
})
export class TabInfoPage {
  constructor(public authService: AuthService, public auth: AngularFireAuth) {}

  userData: firebase.User;
  firstName: string;

  ngOnInit() {
    this.auth.user.pipe(untilDestroyed(this)).subscribe((user) => {
      if (user) {
        this.userData = user;
        this.firstName = this.userData.displayName.split(' ')[0];
      }
    });
  }
}
