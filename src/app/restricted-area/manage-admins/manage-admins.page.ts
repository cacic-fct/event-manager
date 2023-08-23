import { Component, inject, OnInit } from '@angular/core';

import { Functions, httpsCallable } from '@angular/fire/functions';

import { FormGroup, FormControl } from '@angular/forms';
import { AlertController, ToastController } from '@ionic/angular';

import { Firestore, docData, doc } from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';

@Component({
  selector: 'app-manage-admins',
  templateUrl: './manage-admins.page.html',
  styleUrls: ['./manage-admins.page.scss'],
})
export class ManageAdminsPage implements OnInit {
  private firestore: Firestore = inject(Firestore);
  private functions: Functions = inject(Functions);

  adminList$: Observable<string[]>;

  addAdminForm: FormGroup = new FormGroup({
    adminEmail: new FormControl(''),
  });

  constructor(public toastController: ToastController, private alertController: AlertController) {
    this.adminList$ = docData(doc(this.firestore, 'claims', 'admin')).pipe(map((doc) => doc.admins));
  }

  ngOnInit() {}

  async errorToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
    });
    toast.present();
  }

  async successToast() {
    const toast = await this.toastController.create({
      message: 'Operação realizada com sucesso',
      duration: 2000,
    });
    toast.present();
  }

  addAdmin() {
    const addAdminRole = httpsCallable(this.functions, 'claims-addAdminRole');
    addAdminRole({ email: this.addAdminForm.value.adminEmail })
      .then((res) => {
        this.successToast();
        this.addAdminForm.reset();
      })
      .catch((err) => {
        this.errorToast(err);
      });
  }

  removeAdmin(adminEmail: string) {
    const removeAdminRole = httpsCallable(this.functions, 'claims-removeAdminRole');
    removeAdminRole({ email: adminEmail })
      .then((res) => {
        this.successToast();
      })
      .catch((err) => {
        this.errorToast(err);
      });
  }

  async removeConfirmationAlert(adminEmail: string) {
    const alert = await this.alertController.create({
      header: 'Desejar remover este admin?',
      message: adminEmail,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'OK',
          role: 'confirm',
          handler: () => {
            this.removeAdmin(adminEmail);
          },
        },
      ],
    });

    await alert.present();
  }
}
