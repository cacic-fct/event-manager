import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import {
  AngularFirestore,
  AngularFirestoreDocument,
} from '@angular/fire/compat/firestore';
import { User } from '../services/user';
import firebase from 'firebase/compat/app';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { ModalController } from '@ionic/angular';

@Injectable()
export class AuthService {
  userData: any;

  constructor(
    public auth: AngularFireAuth,
    public router: Router,
    public afs: AngularFirestore,
    public ngZone: NgZone,
    public modalController: ModalController
  ) {
    this.auth.useEmulator('http://localhost:8124');
    this.auth.authState.subscribe((user) => {
      if (user) {
        this.userData = user;
        localStorage.setItem('user', JSON.stringify(this.userData));
        JSON.parse(localStorage.getItem('user'));
      } else {
        localStorage.setItem('user', null);
        JSON.parse(localStorage.getItem('user'));
      }
    });
  }

  async SignOut() {
    await this.auth.signOut();
    localStorage.removeItem('user');
    this.router.navigate(['login']);
  }

  GoogleAuth() {
    return this.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  }

  anonAuth() {
    return this.auth
      .signInAnonymously()
      .then(() => {
        console.log('Signed in');
      })
      .catch((error) => {
        console.log('error');
      });
  }

  async AuthLogin(provider: firebase.auth.AuthProvider) {
    this.auth.useDeviceLanguage();
    try {
      const result = await this.auth.signInWithPopup(provider);
      this.ngZone.run(() => {
        this.router.navigate(['tabs']);
      });
      this.SetUserData(result.user);
    } catch (error) {
      console.error('Login failed');
    }
  }

  SetUserData(user: firebase.User) {
    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users/${user.uid}`
    );
    const userData: User = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      dataVersion: '',
    };
    return userRef.set(userData, {
      merge: true,
    });
  }

  async isLoggedIn(): Promise<boolean> {
    return this.auth.authState !== null;
  }
}
