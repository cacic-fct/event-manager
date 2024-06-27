import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonCol,
  IonCard,
  IonItem,
  IonIcon,
  IonLabel,
} from '@ionic/angular/standalone';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AuthService } from 'src/app/shared/services/auth.service';
import { Router, RouterLink } from '@angular/router';
import { User } from 'src/app/shared/services/user';
import { Auth, authState } from '@angular/fire/auth';

import { Mailto, MailtoService } from 'src/app/shared/services/mailto.service';
import { addIcons } from 'ionicons';
import { idCardOutline, logOutOutline, trashBinOutline } from 'ionicons/icons';

@Component({
  selector: 'app-account',
  templateUrl: './account.page.html',
  styleUrls: ['./account.page.scss'],
  standalone: true,
  imports: [
    IonLabel,
    IonIcon,
    IonItem,
    IonCard,
    IonCol,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
    RouterLink,
  ],
})
export class AccountPage {
  mailtoService = inject(MailtoService);
  router = inject(Router);
  authService = inject(AuthService);

  private auth: Auth = inject(Auth);
  authState$ = authState(this.auth);

  alreadyLinked = false;
  isUnesp = false;
  userData: User | undefined;

  constructor(private afs: AngularFirestore) {
    this.authState$.subscribe((user) => {
      if (user) {
        this.afs
          .collection('users')
          .doc<User>(this.authService.userData.uid)
          .get()
          .subscribe((doc) => {
            this.userData = doc.data();
            if (this.userData?.linkedPersonalEmail) {
              this.alreadyLinked = true;
            }
            if (this.userData?.email?.includes('@unesp.br')) {
              this.isUnesp = true;
            }
          });
      }
    });

    addIcons({
      idCardOutline,
      trashBinOutline,
      logOutOutline,
    });
  }

  mailtoDeleteAccount(): void {
    const mailto: Mailto = {
      receiver: 'cacic.fct@gmail.com',
      subject: '[FCT-App] Excluir meu cadastro',
      body: `Olá!\nEu gostaria que a minha conta fosse excluída.\n\n=== Não apague os dados abaixo ===\nE-mail: ${
        this.userData?.email
      }\nCelular: ${this.userData?.phone}\n${
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
