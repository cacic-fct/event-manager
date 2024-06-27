import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonCol,
  IonGrid,
  IonRow,
  IonText,
} from '@ionic/angular/standalone';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.page.html',
  styleUrls: ['./landing.page.scss'],
  standalone: true,
  imports: [
    IonText,
    IonRow,
    IonGrid,
    IonCol,
    IonIcon,
    IonButton,
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
export class LandingPage {
  router = inject(Router);

  jumpTo(anchor: string) {
    const element = document.querySelector(`#${anchor}`);

    if (element) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // If user has reduced motion, don't animate the scroll
      if (reducedMotion) {
        element.scrollIntoView();
      } else {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }
}
