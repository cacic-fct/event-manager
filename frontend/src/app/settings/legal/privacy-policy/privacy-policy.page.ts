import { Component } from '@angular/core';
import { PrivacyCardsComponent } from 'src/app/settings/legal/privacy-policy/privacy-cards/privacy-cards.component';

import { environment } from 'src/environments/environment';
import { IonHeader, IonButtons, IonToolbar, IonBackButton, IonContent, IonTitle } from '@ionic/angular/standalone';
import { MarkdownModule } from 'ngx-markdown';

@Component({
  selector: 'app-privacy-policy',
  templateUrl: './privacy-policy.page.html',
  styleUrls: ['./privacy-policy.page.scss'],
  standalone: true,
  imports: [
    IonTitle,
    IonContent,
    IonBackButton,
    IonToolbar,
    IonButtons,
    IonHeader,
    PrivacyCardsComponent,
    MarkdownModule,
  ],
})
export class PrivacyPolicyPage {
  public baseUrl = environment.baseUrl;
}
