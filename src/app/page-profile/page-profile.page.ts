// @ts-strict-ignore
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Component, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { CoursesService } from '../shared/services/courses.service';

import { take, Observable, BehaviorSubject } from 'rxjs';
import { User } from '../shared/services/user';
import { trace } from '@angular/fire/compat/performance';

import { User as FirebaseUser } from '@firebase/auth';

@Component({
  selector: 'app-page-profile',
  templateUrl: './page-profile.page.html',
  styleUrls: ['./page-profile.page.scss'],
})
export class PageProfilePage implements OnInit {
  user$: Observable<FirebaseUser>;
  userFirestore$: Observable<User>;
  academicID$: Observable<string>;
  serviceWorkerActive: boolean = false;
  _isProfessor = new BehaviorSubject<boolean>(false);
  isProfessor$: Observable<boolean> = this._isProfessor.asObservable();

  constructor(public auth: AngularFireAuth, public courses: CoursesService, private afs: AngularFirestore) {
    // If browser supports service worker
    if ('serviceWorker' in navigator) {
      // If service worker is "activated" or "activating"
      if (navigator.serviceWorker.controller) {
        this.serviceWorkerActive = true;
      }
    }
  }

  ngOnInit() {
    this.user$ = this.auth.user.pipe(take(1), trace('auth'));

    this.user$.subscribe((user) => {
      user.getIdTokenResult().then((idTokenResult) => {
        if (idTokenResult.claims.role === 3000) {
          this._isProfessor.next(true);
        }
      });

      if (user) {
        this.userFirestore$ = this.afs.doc<User>(`users/${user.uid}`).valueChanges().pipe(take(1), trace('firestore'));
      }
    });
  }
}
