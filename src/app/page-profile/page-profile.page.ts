import { Component, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { first, map, Observable } from 'rxjs';
import { trace } from '@angular/fire/compat/performance';

@Component({
  selector: 'app-page-profile',
  templateUrl: './page-profile.page.html',
  styleUrls: ['./page-profile.page.scss'],
})
export class PageProfilePage implements OnInit {
  user: any;
  uid: Observable<string>;
  constructor(public auth: AngularFireAuth) {}

  ngOnInit() {
    this.user = JSON.parse(localStorage.getItem('user'));
    this.uid = this.auth.user.pipe(first(), trace('auth')).pipe(map((user) => user.uid));
  }
}
