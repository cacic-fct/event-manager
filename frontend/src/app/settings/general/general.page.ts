import { Component, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonLabel,
  IonIcon,
  IonItem,
  IonCard,
  IonButtons,
  IonBackButton,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { ServiceWorkerService } from 'src/app/shared/services/service-worker/service-worker.service';

@Component({
  selector: 'app-general',
  templateUrl: './general.page.html',
  styleUrls: ['./general.page.scss'],
  standalone: true,
  imports: [
    IonBackButton,
    IonButtons,
    IonCard,
    IonItem,
    IonIcon,
    IonLabel,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
    RouterLink,
  ],
})
export class GeneralPage {
  isServiceWorkerActive = false;
  isDevMode = isDevMode();
  constructor(private sw: ServiceWorkerService) {
    this.isServiceWorkerActive = this.sw.getServiceWorkerStatus();
  }
}
