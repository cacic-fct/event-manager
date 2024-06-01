import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Component, inject, OnInit } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { Router } from '@angular/router';

import { User } from 'src/app/shared/services/user';
import { AsyncPipe } from '@angular/common';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonIcon,
  IonContent,
  IonCard,
  IonAvatar,
  IonCardTitle,
  IonSkeletonText,
  IonButton,
  IonRouterLink,
  IonLabel,
  IonCol,
  IonItem,
  IonGrid,
  IonRow,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';

import { Mailto, MailtoService } from 'src/app/shared/services/mailto.service';
import { AuthService } from 'src/app/shared/services/auth.service';

@Component({
  selector: 'app-profile-info',
  templateUrl: './profile-info.page.html',
  styleUrls: ['./profile-info.page.scss'],
  standalone: true,
  imports: [
    IonRow,
    IonGrid,
    IonItem,
    IonCol,
    IonLabel,
    IonRouterLink,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonIcon,
    IonContent,
    IonCard,
    IonAvatar,
    IonCardTitle,
    IonSkeletonText,
    IonButton,
    AsyncPipe,
  ],
})
export class ProfileInfoPage implements OnInit {
  private auth: Auth = inject(Auth);
  authState$ = authState(this.auth);

  constructor(
    public authService: AuthService,
    private afs: AngularFirestore,
    private mailtoService: MailtoService,
    private router: Router,
  ) {}

  alreadyLinked = false;
  isUnesp = false;
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

  logout() {
    this.authService.SignOut();

    this.router.navigate(['/login']);
  }
}
