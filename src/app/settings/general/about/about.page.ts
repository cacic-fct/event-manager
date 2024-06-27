import { Component, inject } from '@angular/core';
import { GlobalConstantsService } from '../../../shared/services/global-constants.service';
import { RouterLink } from '@angular/router';
import {
  IonRouterLink,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonGrid,
  IonRow,
  IonCol,
  IonItem,
  IonNote,
  IonLabel,
  IonCard,
  IonCardTitle,
  IonIcon,
} from '@ionic/angular/standalone';
import { ServiceWorkerService } from 'src/app/shared/services/service-worker/service-worker.service';
import { addIcons } from 'ionicons';
import { bookOutline, libraryOutline, peopleOutline } from 'ionicons/icons';

@Component({
  selector: 'app-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
  standalone: true,
  imports: [
    IonIcon,
    IonCardTitle,
    IonCard,
    IonLabel,
    IonNote,
    IonItem,
    RouterLink,
    IonRouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonGrid,
    IonRow,
    IonCol,
  ],
})
export class AboutPage {
  sw = inject(ServiceWorkerService);
  gc = GlobalConstantsService;
  analytics: boolean;
  monitoring: boolean;

  constructor() {
    const analytics = localStorage.getItem('disable-analytics');
    const monitoring = localStorage.getItem('disable-monitoring');

    if (analytics === 'true') {
      this.analytics = false;
    } else {
      this.analytics = true;
    }

    if (monitoring === 'true') {
      this.monitoring = false;
    } else {
      this.monitoring = true;
    }

    addIcons({
      bookOutline,
      libraryOutline,
      peopleOutline,
    });
  }
}
