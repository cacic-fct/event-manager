import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonCard,
  IonIcon,
  IonLabel,
  IonItem,
  IonBackButton,
  IonButtons,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { cogOutline, handLeftOutline, helpCircleOutline, settingsOutline } from 'ionicons/icons';
import { ProfileItemCardComponent } from 'src/app/shared/components/profile-item-card/profile-item-card.component';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [
    IonButtons,
    IonBackButton,
    IonItem,
    IonLabel,
    IonIcon,
    IonCard,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
    RouterLink,
    ProfileItemCardComponent,
  ],
})
export class SettingsPage {
  constructor() {
    addIcons({
      handLeftOutline,
      helpCircleOutline,
      cogOutline,
      settingsOutline,
    });
  }
}
