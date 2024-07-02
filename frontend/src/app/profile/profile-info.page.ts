import { Component } from '@angular/core';
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
  IonButton,
  IonRouterLink,
  IonLabel,
  IonCol,
  IonItem,
  IonGrid,
  IonRow,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { albumsOutline, cogOutline, idCardOutline, qrCodeOutline, settingsOutline } from 'ionicons/icons';

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
    IonButton,
    AsyncPipe,
  ],
})
export class ProfileInfoPage {
  constructor() {
    addIcons({
      qrCodeOutline,
      albumsOutline,
      cogOutline,
      settingsOutline,
      idCardOutline,
    });
  }
}
