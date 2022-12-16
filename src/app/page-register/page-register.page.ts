// @ts-strict-ignore
import { User } from 'src/app/shared/services/user';
import { Component, OnInit, ViewChild } from '@angular/core';

import { Router } from '@angular/router';

import { AuthService } from '../shared/services/auth.service';
import { AlertController, ToastController } from '@ionic/angular';

import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';

import { AngularFirestore, AngularFirestoreDocument } from '@angular/fire/compat/firestore';
import { SwalComponent } from '@sweetalert2/ngx-sweetalert2';

import { GlobalConstantsService } from '../shared/services/global-constants.service';

import { trace } from '@angular/fire/compat/performance';

import { Mailto, MailtoService } from './../shared/services/mailto.service';

import { AngularFireAuth } from '@angular/fire/compat/auth';

import { take } from 'rxjs';

import { WindowService } from '../shared/services/window.service';

import firebase from 'firebase/compat/app';
@Component({
  selector: 'app-page-register',
  templateUrl: './page-register.page.html',
  styleUrls: ['./page-register.page.scss'],
})
export class PageRegisterPage implements OnInit {
  @ViewChild('mySwal')
  private mySwal: SwalComponent;
  windowRef: any;

  dataVersion: string = GlobalConstantsService.userDataVersion;
  userData: any;
  dataForm: FormGroup;
  isUnesp: boolean = false;
  isUndergraduate: boolean = false;

  constructor(
    public authService: AuthService,
    public alertController: AlertController,
    public formBuilder: FormBuilder,
    public afs: AngularFirestore,
    public router: Router,
    public auth: AngularFireAuth,
    private mailtoService: MailtoService,
    private win: WindowService,
    private toastController: ToastController
  ) {
    this.userData = JSON.parse(localStorage.getItem('user'));

    this.dataForm = this.formBuilder.group({
      academicID: [''],
      phone: ['', Validators.required],
      cpf: ['', this.validarCPF],
      fullName: ['', this.fullNameValidator],
      associateStatus: [''],
    });
  }

  ngOnInit() {
    this.afs
      .collection('users')
      .doc<User>(this.userData.uid)
      .valueChanges()
      .pipe(take(1), trace('firestore'))
      .subscribe((user) => {
        if (user.email.includes('@unesp.br')) {
          this.isUnesp = true;
          this.dataForm.controls.associateStatus.addValidators([Validators.required]);
          this.dataForm.controls.associateStatus.setValue(user.associateStatus);
          if (user.associateStatus === 'undergraduate') {
            this.isUndergraduate = true;

            this.dataForm.controls.academicID.setValue(user.academicID);
            this.dataForm.controls.academicID.updateValueAndValidity({ onlySelf: true });
          }
          this.dataForm.controls.fullName.updateValueAndValidity({ onlySelf: true });
        } else {
          this.dataForm.controls.fullName.setValue(user.fullName);
        }
        this.dataForm.controls.phone.setValue(user.phone);
        if (user.cpf) {
          this.dataForm.controls.cpf.setValue(user.cpf);
          this.dataForm.controls.cpf.disable();
        }
      });

    this.windowRef = this.win.windowRef;
    this.windowRef.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'invisible',
    });
  }

  onSubmit() {
    if (!this.dataForm.valid) {
      return;
    }

    this.afs
      .collection('users')
      .doc<User>(this.userData.uid)
      .get()
      .pipe(take(1))
      .subscribe((userData) => {
        const user = userData.data();
        if (user.phone && user.phone === this.dataForm.value.phone) {
          this.submitUserData(user);
          return;
        }

        this.authService.verifyPhoneModal(this.dataForm.value.phone).then((response) => {
          if (response) {
            this.submitUserData(user);
            return;
          }
          this.toastError('1');
        });
      });
  }

  submitUserData(user: User) {
    if (!this.dataForm.value.phone) {
      this.toastError('2');
    }

    const userRef: AngularFirestoreDocument<User> = this.afs.doc(`users/${user.uid}`);
    const userData: User = {
      fullName: this.isUnesp ? this.userData.displayName : this.dataForm.value.fullName,
      associateStatus: this.isUnesp ? this.dataForm.value.associateStatus : 'external',
      academicID: this.isUndergraduate ? this.dataForm.value.academicID : null,
      phone: this.dataForm.value.phone,
      dataVersion: this.dataVersion,
      cpf: this.dataForm.value.cpf,
    };
    this.toastSubmitting();
    userRef
      .update(userData)
      .then(() => {
        this.mySwal.fire();
        // Fake delay to let animation finish
        setTimeout(() => {
          this.mySwal.close();
          this.router.navigate(['/menu']);
        }, 1500);
      })
      .catch((error) => {
        this.toastError('3');
        console.error(error);
      });
  }

  async toastError(code: string) {
    const toast = await this.toastController.create({
      header: 'Erro ao gravar registro',
      message: `Tente novamente. Se o problema persistir, entre em contato conosco. Código: ${code}.`,
      icon: 'checkmark-circle',
      position: 'bottom',
      duration: 7000,
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

  async toastSubmitting() {
    const toast = await this.toastController.create({
      header: 'Enviando informações',
      icon: 'hourglass',
      position: 'bottom',
      duration: 1000,
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

  formatPhone() {
    // Format phoneNumber value to '00 00000-0000'
    let phoneNumber = this.dataForm.value.phone;
    phoneNumber = phoneNumber.replace(/\D/g, '');
    phoneNumber = phoneNumber.replace(/^(\d{2})(\d)/g, '$1 $2');
    phoneNumber = phoneNumber.replace(/(\d)(\d{4})$/, '$1-$2');
    this.dataForm.controls.phone.setValue(phoneNumber);
  }

  formatCPF() {
    // Format cpf value to '000.000.000-00'
    let cpf = this.dataForm.value.cpf;
    if (!cpf) {
      return;
    }
    cpf = cpf.replace(/\D/g, '');
    cpf = cpf.replace(/(\d{3})(\d)/, '$1.$2');
    cpf = cpf.replace(/(\d{3})(\d)/, '$1.$2');
    cpf = cpf.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    this.dataForm.controls.cpf.setValue(cpf);
  }

  fullNameValidator = (control: AbstractControl): ValidationErrors | null => {
    const name = control.value;
    if (this.isUnesp) {
      return null;
    } else {
      if (!name) {
        return { fullName: true };
      }
    }
    return null;
  };

  validarCPF = (control: AbstractControl): ValidationErrors | null => {
    const cpf = control.value;

    if (this.validateCPF(cpf)) {
      return null;
    }
    return { error: 'CPF inválido' };
  };

  validateCPF(cpf: string): boolean {
    if (!cpf) {
      return false;
    }

    // Remove . and -
    cpf = cpf.replace(/\.|-/g, '');

    // If CPF is 000.000.000-00, 111.111.111-11, etc, return false
    if (/^(.)\1*$/.test(cpf)) {
      return false;
    }

    let sum: number = 0;
    let rest: number;
    for (let i = 1; i <= 9; i++) sum = sum + parseInt(cpf.substring(i - 1, i)) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest == 10 || rest == 11) rest = 0;
    if (rest != parseInt(cpf.substring(9, 10))) return false;
    sum = 0;
    for (let i = 1; i <= 10; i++) sum = sum + parseInt(cpf.substring(i - 1, i)) * (12 - i);
    rest = (sum * 10) % 11;
    if (rest == 10 || rest == 11) rest = 0;
    if (rest != parseInt(cpf.substring(10, 11))) return false;
    return true;
  }

  mailtoDocumentPhone(): void {
    const mailto: Mailto = {
      receiver: 'cacic.fct@gmail.com',
      subject: '[FCT-App] Validar meu cadastro',
      body: `Olá!\nEu não possuo (ESPECIFIQUE: CPF/celular), vocês poderiam validar o meu cadastro?\n\n=== Não apague os dados abaixo ===\nE-mail: ${
        this.userData.email
      }\nuid: ${this.userData.uid}\n\nDados do formulário:\nNome completo (fullName): ${
        this.dataForm.get('fullName').value
      }\nCPF: ${this.dataForm.get('cpf').value}\nCelular: ${this.dataForm.get('phone').value}\nRA: ${
        this.dataForm.get('academicID').value
      }\nVínculo: ${this.isUnesp ? this.dataForm.get('associateStatus').value : 'external'}\n`,
    };
    this.mailtoService.open(mailto);
  }

  mailtoIssues(): void {
    const mailto: Mailto = {
      receiver: 'cacic.fct@gmail.com',
      subject: '[FCT-App] Problemas no cadastro',
      body: `Olá!\n\n...\n\n=== Não apague os dados abaixo ===\nE-mail: ${this.userData.email}\nuid: ${
        this.userData.uid
      }\n\nDados do formulário:\nNome completo (fullName): ${this.dataForm.get('fullName').value}\nCPF: ${
        this.dataForm.get('cpf').value
      }\nCelular: ${this.dataForm.get('phone').value}\nRA: ${this.dataForm.get('academicID').value}\nVínculo: ${
        this.isUnesp ? this.dataForm.get('associateStatus').value : 'external'
      }\n`,
    };
    this.mailtoService.open(mailto);
  }

  selectionChange(event) {
    if (event.target.value === 'undergraduate') {
      this.isUndergraduate = true;
      this.dataForm.controls.academicID.setValidators([Validators.required, Validators.pattern('^[0-9]{9}$')]);
      this.dataForm.controls.academicID.updateValueAndValidity({ onlySelf: true });
    } else {
      this.isUndergraduate = false;
      this.dataForm.controls.academicID.setValue('');
      this.dataForm.controls.academicID.clearValidators();
      this.dataForm.controls.academicID.updateValueAndValidity({ onlySelf: true });
    }
  }
}
