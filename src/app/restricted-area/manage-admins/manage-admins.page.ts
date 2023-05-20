import { Component, inject, OnInit } from '@angular/core';

import { Functions, httpsCallable } from '@angular/fire/functions';

import { FormGroup, FormControl } from '@angular/forms';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-manage-admins',
  templateUrl: './manage-admins.page.html',
  styleUrls: ['./manage-admins.page.scss'],
})
export class ManageAdminsPage implements OnInit {
  private functions: Functions = inject(Functions);

  addAdminForm: FormGroup = new FormGroup({
    adminEmail: new FormControl(''),
  });

  removeAdminForm: FormGroup = new FormGroup({
    adminEmail: new FormControl(''),
  });

  constructor(public toastController: ToastController) {}

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
    addAdminRole({ email: this.addAdminForm.value.adminEmail }).then((res) => {
      this.successToast();
      this.addAdminForm.reset();
    });
  }

  removeAdmin() {
    const removeAdminRole = httpsCallable(this.functions, 'claims-removeAdminRole');
    removeAdminRole({ email: this.removeAdminForm.value.adminEmail }).then((res) => {
      this.successToast();
      this.removeAdminForm.reset();
    });
  }
}
