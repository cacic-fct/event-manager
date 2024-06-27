import { Component } from '@angular/core';
import { IonList, IonItem } from '@ionic/angular/standalone';
import { LinkedDataComponent } from 'src/app/settings/legal/privacy-policy/privacy-cards/linked-data/linked-data.component';
import { NotLinkedDataComponent } from 'src/app/settings/legal/privacy-policy/privacy-cards/not-linked-data/not-linked-data.component';
import { TrackingDataComponent } from 'src/app/settings/legal/privacy-policy/privacy-cards/tracking-data/tracking-data.component';

@Component({
  selector: 'app-privacy-cards',
  templateUrl: './privacy-cards.component.html',
  styleUrls: ['./privacy-cards.component.scss'],
  imports: [IonItem, IonList, LinkedDataComponent, NotLinkedDataComponent, TrackingDataComponent],
  standalone: true,
})
export class PrivacyCardsComponent {}
