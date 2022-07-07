import { Component, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { first } from 'rxjs';

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

    this.auth.user.pipe(first()).subscribe((user) => {
      if (user) {
        this.uid = user.uid;
      }
    });
  }
}
