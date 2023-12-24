// @ts-strict-ignore
import { Component, inject, OnInit } from '@angular/core';
import { AuthService } from 'src/app/shared/services/auth.service';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { User } from 'src/app/shared/services/user';

import { Mailto, MailtoService } from 'src/app/shared/services/mailto.service';
import { Auth, authState } from '@angular/fire/auth';
import { RouterLink } from '@angular/router';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonCard,
  IonItem,
  IonIcon,
  IonLabel,
  IonRouterLink,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonItem,
    IonIcon,
    IonLabel,
    RouterLink,
    IonRouterLink,
  ],
})
export class SettingsPage implements OnInit {
  private auth: Auth = inject(Auth);
  authState$ = authState(this.auth);

  constructor(public authService: AuthService, private afs: AngularFirestore, private mailtoService: MailtoService) {}

  alreadyLinked: boolean = false;
  isUnesp: boolean = false;
  userData: User;

  ngOnInit() {
    this.authState$.subscribe((user) => {
      if (user) {
        this.afs
          .collection('users')
          .doc<User>(this.authService.userData.uid)
          .get()
          .subscribe((doc) => {
            this.userData = doc.data();
            if (this.userData.linkedPersonalEmail) {
              this.alreadyLinked = true;
            }
            if (this.userData.email.includes('@unesp.br')) {
              this.isUnesp = true;
            }
          });
      }
    });
  }

  mailtoDeleteAccount(): void {
    const mailto: Mailto = {
      receiver: 'cacic.fct@gmail.com',
      subject: '[FCT-App] Excluir meu cadastro',
      body: `Olá!\nEu gostaria que a minha conta fosse excluída.\n\n=== Não apague os dados abaixo ===\nE-mail: ${
        this.userData.email
      }\nCelular: ${this.userData.phone}\n${
        this.isUnesp ? ('Vinculou e-mail pessoal:' + this.alreadyLinked ? 'Sim' : 'Não' + '\n') : ''
      }`,
    };
    this.mailtoService.open(mailto);
  }
}
