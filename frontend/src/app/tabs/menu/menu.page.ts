import { Component, inject, isDevMode } from '@angular/core';

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
  IonGrid,
  IonCol,
  IonRow,
  IonAvatar,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { ProfileItemCardComponent } from 'src/app/shared/components/profile-item-card/profile-item-card.component';
import { addIcons } from 'ionicons';
import {
  bookOutline,
  cogOutline,
  hammerOutline,
  logOutOutline,
  peopleCircleOutline,
  peopleOutline,
  schoolOutline,
  settingsOutline,
} from 'ionicons/icons';
import { AuthService } from 'src/app/shared/services/auth.service';

@Component({
  selector: 'app-menu',
  templateUrl: 'menu.page.html',
  styleUrls: ['menu.page.scss'],
  standalone: true,
  imports: [
    IonAvatar,
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
    IonGrid,
    IonCol,
    IonRow,
    ProfileItemCardComponent,
  ],
})
export class MenuPage {
  isDevMode: boolean = isDevMode();
  authService = inject(AuthService);

  constructor() {
    addIcons({
      peopleOutline,
      bookOutline,
      schoolOutline,
      peopleCircleOutline,
      hammerOutline,
      cogOutline,
      settingsOutline,
      logOutOutline,
    });

    // @ts-ignore
    asdasd();
  }
}
