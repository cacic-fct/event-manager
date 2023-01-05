// @ts-strict-ignore
import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/shared/services/auth.service';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { User } from 'src/app/shared/services/user';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { Mailto, MailtoService } from 'src/app/shared/services/mailto.service';

@Component({
  selector: 'app-page-settings',
  templateUrl: './page-settings.page.html',
  styleUrls: ['./page-settings.page.scss'],
})
export class PageSettingsPage implements OnInit {
  constructor(
    public authService: AuthService,
    private auth: AngularFireAuth,
    private afs: AngularFirestore,
    private mailtoService: MailtoService
  ) {}

  alreadyLinked: boolean = false;
  isUnesp: boolean = false;
  userData: User;

  ngOnInit() {
    this.auth.authState.subscribe((user) => {
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
