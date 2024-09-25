import { Component, inject } from '@angular/core';

import { Functions, httpsCallable } from '@angular/fire/functions';

import { FormGroup, FormControl, ReactiveFormsModule } from '@angular/forms';
import { AlertController, ToastController } from '@ionic/angular/standalone';

import { Firestore, docData, doc } from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonGrid,
  IonRow,
  IonCol,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonList,
  IonIcon,
} from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';
import { getString, RemoteConfig } from '@angular/fire/remote-config';
import { addIcons } from 'ionicons';
import { trashOutline } from 'ionicons/icons';

@Component({
  selector: 'app-manage-admins',
  templateUrl: './manage-admins.page.html',
  styleUrls: ['./manage-admins.page.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonGrid,
    IonRow,
    IonCol,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonList,
    IonIcon,
    ReactiveFormsModule,
    AsyncPipe,
  ],
})
export class ManageAdminsPage {
  private firestore: Firestore = inject(Firestore);
  private functions: Functions = inject(Functions);
  private remoteConfig: RemoteConfig = inject(RemoteConfig);

  public adminList$: Observable<string[]>;

  addAdminForm: FormGroup = new FormGroup({
    adminEmail: new FormControl(''),
  });

  public whitelist: string[];
  public blacklist: string[];

  constructor(
    public toastController: ToastController,
    private alertController: AlertController,
  ) {
    this.adminList$ = docData(doc(this.firestore, 'claims', 'admin')).pipe(
      map((doc) => (doc ? doc['admins'] : [])),
    ) as Observable<string[]>;

    // No need to be real-time getStringChanges, as the lists barely change
    const whitelistString = getString(this.remoteConfig, 'adminWhitelist');
    const blacklistString = getString(this.remoteConfig, 'adminBlacklist');

    this.whitelist = whitelistString
      // Remove brackets and quotes
      .replace(/[[\]"']/g, '')
      .split(',')
      // Remove whitespace
      .map((item) => item.trim());

    this.blacklist = blacklistString
      .replace(/[[\]"']/g, '')
      .split(',')
      .map((item) => item.trim());

    addIcons({
      trashOutline,
    });
  }

  async errorToast(message: string) {
    const toast = await this.toastController.create({
      message: message || 'Erro desconhecido',
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
    const email = this.addAdminForm.value.adminEmail;
    if (this.blacklist.includes(email)) {
      this.errorToast('Permissão negada');
      this.addAdminForm.reset();
      return;
    }

    const addAdminRole = httpsCallable(this.functions, 'claims-addAdminRole');
    addAdminRole({ email: email })
      .then(() => {
        this.successToast();
        this.addAdminForm.reset();
      })
      .catch((err) => {
        this.errorToast(err.message);
        console.error(err);
      });
  }

  removeAdmin(adminEmail: string) {
    const removeAdminRole = httpsCallable(this.functions, 'claims-removeAdminRole');
    removeAdminRole({ email: adminEmail })
      .then(() => {
        this.successToast();
      })
      .catch((err) => {
        this.errorToast(err.message);
        console.error(err);
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
