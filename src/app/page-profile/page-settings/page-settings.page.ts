import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/shared/services/auth.service';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { User } from 'src/app/shared/services/user';
import { AngularFireAuth } from '@angular/fire/compat/auth';

@Component({
  selector: 'app-page-settings',
  templateUrl: './page-settings.page.html',
  styleUrls: ['./page-settings.page.scss'],
})
export class PageSettingsPage implements OnInit {
  constructor(public authService: AuthService, private auth: AngularFireAuth, private afs: AngularFirestore) {}

  alreadyLinked: boolean = false;
  isUnesp: boolean = false;

  ngOnInit() {
    this.auth.authState.subscribe((user) => {
      if (user) {
        this.afs
          .collection('users')
          .doc<User>(this.authService.userData.uid)
          .get()
          .subscribe((doc) => {
            const userData = doc.data();
            if (userData.linkedPersonalEmail) {
              this.alreadyLinked = true;
            }
            if (userData.email.includes('@unesp.br')) {
              this.isUnesp = true;
            }
          });
      }
    });
  }
}
