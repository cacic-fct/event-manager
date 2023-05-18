// @ts-strict-ignore
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Component, inject, OnInit } from '@angular/core';
import { Auth, user, getIdTokenResult } from '@angular/fire/auth';
import { CoursesService } from '../shared/services/courses.service';

import { take, Observable, BehaviorSubject } from 'rxjs';
import { User } from '../shared/services/user';
import { trace } from '@angular/fire/compat/performance';

@Component({
  selector: 'app-page-profile',
  templateUrl: './page-profile.page.html',
  styleUrls: ['./page-profile.page.scss'],
})
export class PageProfilePage implements OnInit {
  private auth: Auth = inject(Auth);

  user$ = user(this.auth);
  userFirestore$: Observable<User>;
  academicID$: Observable<string>;
  serviceWorkerActive: boolean = false;
  _isProfessor = new BehaviorSubject<boolean>(false);
  isProfessor$: Observable<boolean> = this._isProfessor.asObservable();

  constructor(public courses: CoursesService, private afs: AngularFirestore) {
    // If browser supports service worker
    if ('serviceWorker' in navigator) {
      // If service worker is "activated" or "activating"
      if (navigator.serviceWorker.controller) {
        this.serviceWorkerActive = true;
      }
    }
  }

  ngOnInit() {
    this.user$.pipe(take(1), trace('auth')).subscribe((user) => {
      if (user) {
        getIdTokenResult(user).then((idTokenResult) => {
          if (idTokenResult.claims.role === 3000) {
            this._isProfessor.next(true);
          }
        });

        this.userFirestore$ = this.afs.doc<User>(`users/${user.uid}`).valueChanges().pipe(take(1), trace('firestore'));
      }
    });
  }
}
