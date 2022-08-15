import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { AngularFirestore, AngularFirestoreDocument } from '@angular/fire/compat/firestore';
import { User } from '../services/user';
import firebase from 'firebase/compat/app';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { ModalController, ToastController } from '@ionic/angular';
import { GlobalConstantsService } from './global-constants.service';
import { AngularFireRemoteConfig } from '@angular/fire/compat/remote-config';
import { first, Observable } from 'rxjs';
import { trace } from '@angular/fire/compat/performance';
import { AngularFireFunctions } from '@angular/fire/compat/functions';

@Injectable()
export class AuthService {
  userData: firebase.User;
  dataVersion = GlobalConstantsService.userDataVersion;

  constructor(
    public auth: AngularFireAuth,
    public router: Router,
    public afs: AngularFirestore,
    public ngZone: NgZone,
    public modalController: ModalController,
    public remoteConfig: AngularFireRemoteConfig,
    public toastController: ToastController,
    private fns: AngularFireFunctions
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
        console.error(error);
      });
  }

  async AuthLogin(provider: firebase.auth.AuthProvider) {
    this.auth.useDeviceLanguage();
    try {
      const result = await this.auth.signInWithPopup(provider);
      this.SetUserData(result.user);
    } catch (error) {
      console.error('Login failed');
      console.error(error);
      this.toastLoginFailed();
      this.SignOut();
    }
  }

  async toastLoginFailed() {
    const toast = await this.toastController.create({
      header: 'Houve um erro no seu login',
      message: 'Verifique a sua conexão e faça login novamente.',
      icon: 'close-circle',
      position: 'bottom',
      duration: 5000,
      buttons: [
        {
          side: 'end',
          text: 'OK',
          role: 'cancel',
        },
      ],
    });
    toast.present();
  }

  SetUserData(user: firebase.User) {
    const userRef: AngularFirestoreDocument<any> = this.afs.doc(`users/${user.uid}`);
    const userData: User = {
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
    this.remoteConfig.booleans.registerPrompt.pipe(first(), trace('remoteconfig')).subscribe((registerPrompt) => {
      if (registerPrompt) {
        this.afs
          .doc<User>(`users/${user.uid}`)
          .valueChanges()
          .subscribe((data) => {
            if (data === undefined) {
              return;
            }
            if (!data.dataVersion || data.dataVersion !== this.dataVersion) {
              this.router.navigate(['/register']);
            }
          });
      }
    });
  }

  getUserUid(manualInput: string): { message?: string; status?: boolean; uid?: string } | Observable<any> {
    // Remove spaces from the string
    manualInput = manualInput.replace(/\s/g, '');

    // Check if input has only one '+' and numbers
    const isNumeric: boolean = manualInput.match(/^\+?\d+$/) ? true : false;

    // If string doesn't include "@" and isn't numeric only or is empty, return false
    if ((!manualInput.includes('@') && !isNumeric) || manualInput === '') {
      return { message: 'Os dados inseridos são inválidos', status: false };
    }

    if (isNumeric) {
      if (manualInput.length < 11 || manualInput.length > 14) {
        return { message: 'O número de telefone deve ter entre 11 e 14 dígitos', status: false };
      }

      // If string is numeric only and has length of 11, add country code
      if (manualInput.length === 11) {
        manualInput = `+55${manualInput}`;
      } else if (manualInput.length === 13) {
        manualInput = `+${manualInput}`;
      }
    }

    const getUserUid = this.fns.httpsCallable('getUserUid');

    return getUserUid({ string: manualInput });
  }

  instanceOfResponse(object: any): object is Response {
    return 'message' in object;
  }
}

interface Response {
  status: boolean;
  message: string;
}
