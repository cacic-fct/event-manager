import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Component, Input, OnInit } from '@angular/core';
import firebase from 'firebase/compat/app';

import { AngularFireAuth } from '@angular/fire/compat/auth';
import { WindowService } from '../shared/services/window.service';

import { timer, first } from 'rxjs';

import { ModalController } from '@ionic/angular';

import * as authFirebase from 'firebase/auth';
import { User } from '../shared/services/user';

import { Mailto, NgxMailtoService } from 'ngx-mailto';

import { add } from 'date-fns';

@Component({
  selector: 'app-page-verify-phone',
  templateUrl: './page-verify-phone.page.html',
  styleUrls: ['./page-verify-phone.page.scss'],
})
export class PageVerifyPhonePage implements OnInit {
  verificationCode: string;
  @Input() phone: string;
  windowRef: any;
  timer: any;
  cooldown: boolean = false;
  attempts: number = 0;
  lastVerificationCode: string;
  invalidCode: boolean = false;
  updatePhone: boolean = false;
  buttonEnabled: boolean = false;
  phoneAlreadyRegistered: boolean = false;

  constructor(
    public auth: AngularFireAuth,
    public afs: AngularFirestore,
    private win: WindowService,
    public modalController: ModalController,
    private mailtoService: NgxMailtoService
  ) {}

  ngOnInit() {
    this.windowRef = this.win.windowRef;
    this.linkOrUpdatePhone();
  }

  linkOrUpdatePhone() {
    if (this.isOnCooldown()) {
      return;
    }

    this.setTimer();

    this.auth.authState.pipe(first()).subscribe((userState) => {
      this.afs
        .collection('users')
        .doc<User>(userState.uid)
        .valueChanges()
        .pipe(first())
        .subscribe((user) => {
          if (user.phone) {
            this.updatePhone = true;
            this.phoneUpdate(this.phone);
          } else {
            this.phoneLink(this.phone);
          }
        });
    });
  }

  setTimer() {
    const minutes: number = Math.pow(2, this.attempts);
    this.cooldown = true;
    this.attempts += 1;

    this.windowRef.canExecuteAgainOn = add(new Date(), {
      minutes: minutes,
    });

    this.timer = timer(minutes * 60000).subscribe(() => {
      this.cooldown = false;
      this.windowRef.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        size: 'invisible',
      });
    });
  }

  isOnCooldown(): boolean {
    if (this.windowRef.canExecuteAgainOn) {
      if (new Date() < this.windowRef.canExecuteAgainOn) {
        return true;
      }
    }

    return false;
  }

  phoneLink(phone: string) {
    const fullPhoneNumber = '+55 ' + phone;
    const appVerifier = this.windowRef.recaptchaVerifier;

    this.auth.authState.pipe(first()).subscribe((user) => {
      if (user) {
        authFirebase
          .linkWithPhoneNumber(user, fullPhoneNumber, appVerifier)
          .then((confirmationResult) => {
            // SMS sent
            this.windowRef.confirmationResult = confirmationResult;
            this.buttonEnabled = true;
          })
          .catch((error) => {
            // Error SMS not sent
            console.error(error);
            this.windowRef.lastExecution = null;
            this.modalController.dismiss(null);
          });
      }
    });
  }

  phoneUpdate(phone: string) {
    const fullPhoneNumber = '+55 ' + phone;
    const appVerifier = this.windowRef.recaptchaVerifier;

    const provider = new firebase.auth.PhoneAuthProvider();

    provider
      .verifyPhoneNumber(fullPhoneNumber, appVerifier)
      .then((confirmationResult) => {
        // SMS sent
        this.windowRef.confirmationResult = confirmationResult;
        this.buttonEnabled = true;
      })
      .catch((error) => {
        // Error SMS not sent
        console.error(error);
      });
  }

  verifyPhone() {
    if (this.verificationCode === this.lastVerificationCode) {
      return;
    }

    if (this.updatePhone) {
      let phoneCredential = firebase.auth.PhoneAuthProvider.credential(
        this.windowRef.confirmationResult,
        this.verificationCode
      );

      this.auth.authState.pipe(first()).subscribe((user) => {
        user
          .updatePhoneNumber(phoneCredential)
          .then(() => {
            // User signed in successfully.
            this.modalController.dismiss({ data: true });
          })
          .catch((error) => {
            // User couldn't sign in
            if (error.code === 'auth/invalid-verification-code') {
              console.error(error);
              this.lastVerificationCode = this.verificationCode;
              this.invalidCode = true;
            } else if (error.code === 'auth/account-exists-with-different-credential') {
              console.error(error);
              this.phoneAlreadyRegistered = true;
            }
          });
      });
    } else {
      this.windowRef.confirmationResult
        .confirm(this.verificationCode)
        .then(() => {
          // User signed in successfully.
          this.modalController.dismiss({ data: true });
        })
        .catch((error) => {
          console.error(error);
          // User couldn't sign in
          if (error.code === 'auth/invalid-verification-code') {
            this.lastVerificationCode = this.verificationCode;
            this.invalidCode = true;
          } else if (error.code === 'auth/account-exists-with-different-credential') {
            this.phoneAlreadyRegistered = true;
          }
        });
    }
  }

  verificationCodeChange() {
    this.invalidCode = false;
  }

  mailto(): void {
    const userData = JSON.parse(localStorage.getItem('user'));
    const mailto: Mailto = {
      receiver: 'cacic.fct@gmail.com',
      subject: '[FCT-App] Celular já registrado',
      body: `Olá!\nRecebi a mensagem de que meu celular já pertence a outra conta. Vocês podem me ajudar?\n\n=== Não apague os dados abaixo ===\nE-mail: ${userData.email}\nuid: ${userData.uid}\nCelular: ${this.phone}`,
    };
    this.mailtoService.open(mailto);
  }
}
