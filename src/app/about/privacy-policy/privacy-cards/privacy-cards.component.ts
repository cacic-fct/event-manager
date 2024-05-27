import { Component, OnInit } from '@angular/core';
import { IonList, IonItem } from '@ionic/angular/standalone';
import { LinkedDataComponent } from 'src/app/about/privacy-policy/privacy-cards/linked-data/linked-data.component';
import { NotLinkedDataComponent } from 'src/app/about/privacy-policy/privacy-cards/not-linked-data/not-linked-data.component';

@Component({
  selector: 'app-privacy-cards',
  templateUrl: './privacy-cards.component.html',
  styleUrls: ['./privacy-cards.component.scss'],
  imports: [IonItem, IonList, LinkedDataComponent, NotLinkedDataComponent],
  standalone: true,
})
export class PrivacyCardsComponent implements OnInit {
  constructor() {}

  ngOnInit() {}
}
