import { EventItem } from 'src/app/shared/services/event';
import { Injectable, NgZone } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AngularFirestore, AngularFirestoreDocument } from '@angular/fire/compat/firestore';
import { User } from '../services/user';
import firebase from 'firebase/compat/app';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { ModalController, ToastController } from '@ionic/angular';
import { GlobalConstantsService } from './global-constants.service';
import { take, Observable, map, switchMap } from 'rxjs';
import { trace } from '@angular/fire/compat/performance';
import { PageVerifyPhonePage } from 'src/app/page-verify-phone/page-verify-phone.page';

import * as firebaseAuth from 'firebase/auth';
import { AngularFireFunctions } from '@angular/fire/compat/functions';
import { getStringChanges, RemoteConfig, getBooleanChanges } from '@angular/fire/remote-config';
import { arrayRemove } from '@angular/fire/firestore';

@Injectable()
export class AuthService {
  userData: firebase.User;
  dataVersion: string = GlobalConstantsService.userDataVersion;

  constructor(
    public auth: AngularFireAuth,
    public router: Router,
    public afs: AngularFirestore,
    public ngZone: NgZone,
    public modalController: ModalController,
    private remoteConfig: RemoteConfig,
    public toastController: ToastController,
    private fns: AngularFireFunctions,
    private route: ActivatedRoute
  ) {
    this.auth.authState.pipe(trace('auth')).subscribe((user) => {
      if (user) {
        this.userData = user;
        localStorage.setItem('user', JSON.stringify(this.userData));
        JSON.parse(localStorage.getItem('user'));

        getStringChanges(this.remoteConfig, 'professors').subscribe((professors) => {
          if (professors) {
            const professorsList: string[] = JSON.parse(professors);

            // Check if user email matches a professor email.
            // Professors are exempt from the register prompt
            if (professorsList.includes(user.email)) {
              this.auth.idTokenResult.pipe(take(1)).subscribe((idTokenResult) => {
                const claims = idTokenResult.claims;

                // If role is not set, set it to professor (3000)
                if (!claims.role || claims.role < 3000) {
                  const userRef: AngularFirestoreDocument<User> = this.afs.doc(`users/${user.uid}`);
                  const userData: User = {
                    associateStatus: 'professor',
                  };
                  userRef.set(userData, {
                    merge: true,
                  });

                  const addProfessor = this.fns.httpsCallable('addProfessorRole');
                  addProfessor({ email: user.email }).pipe(take(1)).subscribe();
                }
              });
            }
          } else {
            // Not a professor or remote config not loaded yet
            this.CompareUserdataVersion(this.userData)
              .pipe(take(1))
              .subscribe((response) => {
                if (response) {
                  return;
                }
                this.afs
                  .collection('users')
                  .doc<User>(this.userData.uid)
                  .valueChanges()
                  .pipe(take(1))
                  .subscribe((user) => {
                    if (user.pending?.onlineAttendance) {
                      user.pending.onlineAttendance.forEach((eventID) => {
                        this.afs
                          .collection('events')
                          .doc<EventItem>(eventID)
                          .valueChanges({ idField: 'id' })
                          .pipe(take(1))
                          .subscribe((eventData) => {
                            if (eventData.attendanceCollectionStart && !eventData.attendanceCollectionEnd) {
                              this.router.navigate(['/confirmar-presenca', eventID]);
                            } else if (eventData.attendanceCollectionEnd) {
                              this.afs
                                .collection('users')
                                .doc<User>(this.userData.uid)
                                .update({
                                  // @ts-ignore
                                  pending: { onlineAttendance: arrayRemove(eventID) },
                                });
                            }
                          });
                      });
                    }
                  });
              });
          }
        });
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

  GoogleLink() {
    return this.LinkProfile(new firebase.auth.GoogleAuthProvider());
  }

  async anonAuth() {
    try {
      await this.auth.signInAnonymously();
      console.log('Signed in');
    } catch (error) {
      console.error(error);
    }
  }

  async AuthLogin(provider: firebase.auth.AuthProvider) {
    this.auth.useDeviceLanguage();
    try {
      this.auth.signInWithPopup(provider).then((result) => {
        this.SetUserData(result.user);

        this.route.queryParams.pipe(take(1)).subscribe((params) => {
          const redirect = params['redirect'];

          if (redirect) {
            this.router.navigate([redirect]);
          } else {
            this.router.navigate(['menu']);
          }
        });
      });
    } catch (error) {
      console.error('Login failed');
      console.error(error);
      this.toastLoginFailed();
      this.SignOut();
    }
  }

  async LinkProfile(provider: firebase.auth.AuthProvider) {
    this.auth.useDeviceLanguage();
    try {
      const result = await (await this.auth.currentUser).linkWithPopup(provider);
      const userRef: AngularFirestoreDocument<User> = this.afs.doc(`users/${result.user.uid}`);
      const userData: User = {
        linkedPersonalEmail: true,
      };
      return userRef.set(userData, {
        merge: true,
      });
    } catch (error) {
      console.error('Link profile failed');
      console.error(error);
      this.toastLoginFailed();
    }
  }

  async toastLoginFailed() {
    const toast = await this.toastController.create({
      header: 'Ocorreu um erro no seu login',
      message: 'Verifique a sua conexão e tente novamente.',
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

  private SetUserData(user: firebase.User) {
    const userRef: AngularFirestoreDocument<User> = this.afs.doc(`users/${user.uid}`);
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

  private CompareUserdataVersion(user: firebase.User): Observable<boolean> {
    return getBooleanChanges(this.remoteConfig, 'registerPrompt').pipe(
      take(1),
      trace('remoteconfig'),
      map((registerPrompt) => {
        if (registerPrompt) {
          return this.afs
            .doc<User>(`users/${user.uid}`)
            .get()
            .pipe(
              trace('firestore'),
              map((doc) => {
                const data = doc.data();
                if (data === undefined) {
                  return true;
                } else if (!data.dataVersion || data.dataVersion !== this.dataVersion) {
                  this.router.navigate(['/register']);
                  return true;
                } else {
                  return false;
                }
              })
            );
        }
      }),
      switchMap((value) => value)
    );
  }

  async verifyPhoneModal(phone: string): Promise<boolean> {
    const modal = await this.modalController.create({
      component: PageVerifyPhonePage,
      componentProps: {
        phone: phone,
      },
      backdropDismiss: false,
      swipeToClose: false,
      keyboardClose: false,
    });

    await modal.present();

    return modal.onDidDismiss().then((response) => {
      const data = response.data;
      if (data) {
        return new Promise<boolean>((resolve) => {
          resolve(true);
        });
      }
      return new Promise<boolean>((resolve) => {
        resolve(false);
      });
    });
  }

  async phoneUnlink() {
    firebaseAuth.unlink(this.userData, firebase.auth.PhoneAuthProvider.PROVIDER_ID);
  }
  getUserUid(manualInput: string): GetUserUIDResponse | Observable<GetUserUIDResponse> {
    // Remove spaces from the string
    manualInput = manualInput.replace(/\s/g, '');

    // Check if input has only one '+' and numbers
    const isNumeric: boolean = /^\+?\d+$/.test(manualInput);

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

  instanceOfResponse(object: any): object is GetUserUIDResponse {
    return 'message' in object;
  }
}

export interface GetUserUIDResponse {
  status?: boolean;
  message?: string;
  uid?: string;
}
