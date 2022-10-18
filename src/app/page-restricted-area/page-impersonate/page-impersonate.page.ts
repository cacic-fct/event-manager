import { Component, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFireFunctions } from '@angular/fire/compat/functions';
import { FormGroup, FormBuilder } from '@angular/forms';
import { ToastController } from '@ionic/angular';
import { take } from 'rxjs';

@Component({
  selector: 'app-page-impersonate',
  templateUrl: './page-impersonate.page.html',
  styleUrls: ['./page-impersonate.page.scss'],
})
export class PageImpersonatePage implements OnInit {
  impersonateForm: FormGroup;

  constructor(
    private formBuilder: FormBuilder,
    private fns: AngularFireFunctions,
    private toastController: ToastController,
    private auth: AngularFireAuth
  ) {
    this.impersonateForm = this.formBuilder.group({
      userID: '',
    });
  }

  ngOnInit() {}

  impersonate() {
    const impersonate = this.fns.httpsCallable('impersonate');
    impersonate({ uid: this.impersonateForm.get('userID').value })
      .pipe(take(1))
      .subscribe((res) => {
        this.auth.signInWithCustomToken(res.token).then(() => {
          this.successToast();
          this.impersonateForm.reset();
        });
      });
  }

  async successToast() {
    const toast = await this.toastController.create({
      message: 'Operação realizada com sucesso',
      duration: 2000,
    });
    toast.present();
  }
}
