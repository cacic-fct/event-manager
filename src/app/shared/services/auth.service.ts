import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { AngularFirestore, AngularFirestoreDocument } from '@angular/fire/compat/firestore';
import { User } from '../services/user';
import firebase from 'firebase/compat/app';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { ModalController } from '@ionic/angular';
import { GlobalConstantsService } from './global-constants.service';

@Injectable()
export class AuthService {
  userData: firebase.User;
  dataVersion = GlobalConstantsService.userDataVersion;

  constructor(
    public auth: AngularFireAuth,
    public router: Router,
    public afs: AngularFirestore,
    public ngZone: NgZone,
    public modalController: ModalController
  ) {
    this.auth.authState.subscribe((user) => {
      if (user) {
        this.userData = user;
        localStorage.setItem('user', JSON.stringify(this.userData));
        JSON.parse(localStorage.getItem('user'));
        this.CompareUserdataVersion(this.userData);
      } else {
        localStorage.removeItem('user');
      }
    });
  }

  async SignOut() {
    await this.auth.signOut();
    localStorage.removeItem('user');
  }

  GoogleAuth() {
    return this.AuthLogin(new firebase.auth.GoogleAuthProvider());
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
      this.SetUserData(result.user);
    } catch (error) {
      console.error('Login failed');
    }
  }

  SetUserData(user: firebase.User) {
    const userRef: AngularFirestoreDocument<any> = this.afs.doc(`users/${user.uid}`);
    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    };
    return userRef.set(userData, {
      merge: true,
    });
  }

  CompareUserdataVersion(user: firebase.User) {
    this.afs
      .doc<User>(`users/${user.uid}`)
      .valueChanges()
      .subscribe((data) => {
        if (!data.dataVersion || data.dataVersion !== this.dataVersion) {
          this.router.navigate(['/register']);
        }
      });
  }
}
