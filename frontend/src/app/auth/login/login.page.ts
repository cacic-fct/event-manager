import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GoogleButtonComponent } from './components/google-button/google-button.component';
import {
  IonHeader,
  IonRouterLink,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonGrid,
  IonRow,
  IonCol,
} from '@ionic/angular/standalone';
import { GlobalConstantsService } from 'src/app/shared/services/global-constants.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    GoogleButtonComponent,
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
export class LoginPage {
  gc = GlobalConstantsService;
}
