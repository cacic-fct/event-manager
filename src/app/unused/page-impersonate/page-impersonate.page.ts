// @ts-strict-ignore
import { Component, inject, OnInit } from '@angular/core';
import { Auth, signInWithCustomToken } from '@angular/fire/auth';
import { FormGroup, FormBuilder } from '@angular/forms';
import { ToastController } from '@ionic/angular';
import { Functions, httpsCallable } from '@angular/fire/functions';

@Component({
  selector: 'app-page-impersonate',
  templateUrl: './page-impersonate.page.html',
  styleUrls: ['./page-impersonate.page.scss'],
})
export class PageImpersonatePage implements OnInit {
  impersonateForm: FormGroup;
  private auth: Auth = inject(Auth);
  private functions: Functions = inject(Functions);

  constructor(private formBuilder: FormBuilder, private toastController: ToastController) {
    this.impersonateForm = this.formBuilder.group({
      userID: '',
    });
  }

  ngOnInit() {}

  impersonate() {
    const impersonate = httpsCallable(this.functions, 'impersonate');
    impersonate({ uid: this.impersonateForm.get('userID').value }).then((res) => {
      const data: any = res.data;
      signInWithCustomToken(this.auth, data).then(() => {
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
