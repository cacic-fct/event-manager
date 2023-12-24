// @ts-strict-ignore
import { Component, inject } from '@angular/core';

import { AuthService } from '../../shared/services/auth.service';

import { trace } from '@angular/fire/compat/performance';

import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';

import { environment } from 'src/environments/environment';
import { Auth, authState, user, User } from '@angular/fire/auth';
import { AsyncPipe } from '@angular/common';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonTitle,
  IonContent,
  IonCard,
  IonItem,
  IonLabel,
  IonRouterLink,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';

@UntilDestroy()
@Component({
  selector: 'app-tab3',
  templateUrl: 'menu.page.html',
  styleUrls: ['menu.page.scss'],
  standalone: true,
  imports: [
    AsyncPipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonCard,
    IonItem,
    IonLabel,
    IonRouterLink,
    RouterLink,
  ],
})
export class MenuPage {
  private auth: Auth = inject(Auth);
  user$ = user(this.auth);
  authState$ = authState(this.auth);

  isProduction: boolean = environment.production;
  userData: User;
  firstName: string;

  constructor(public authService: AuthService) {}

  ngOnInit() {
    this.user$.pipe(untilDestroyed(this), trace('auth')).subscribe((user) => {
      if (user) {
        this.userData = user;
        this.firstName = this.userData.displayName.split(' ')[0];
      }
    });
  }
}
