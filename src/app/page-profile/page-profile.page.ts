import { Component, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
@UntilDestroy()
@Component({
  selector: 'app-page-profile',
  templateUrl: './page-profile.page.html',
  styleUrls: ['./page-profile.page.scss'],
})
export class PageProfilePage implements OnInit {
  user: any;
  uid: string;
  constructor(public auth: AngularFireAuth) {}

  ngOnInit() {
    this.user = JSON.parse(localStorage.getItem('user'));

    this.auth.user.pipe(untilDestroyed(this)).subscribe((user) => {
      if (user) {
        this.uid = user.uid;
      }
    });
  }
}
