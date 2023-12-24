import { Component, OnInit } from '@angular/core';
import { GlobalConstantsService } from '../shared/services/global-constants.service';
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
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
  standalone: true,
  imports: [
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
export class AboutPage implements OnInit {
  globalConstants = GlobalConstantsService;

  constructor() {}

  ngOnInit() {}
}
