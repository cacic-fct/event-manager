import { Component, OnInit } from '@angular/core';
import { IonList, IonItem, IonLabel, IonIcon, IonNote } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { analyticsOutline, ellipsisHorizontalCircleOutline, navigateOutline, searchOutline } from 'ionicons/icons';

@Component({
  selector: 'app-not-linked-data',
  templateUrl: './not-linked-data.component.html',
  styleUrls: ['./not-linked-data.component.scss'],
  imports: [IonList, IonItem, IonLabel, IonIcon, IonNote],
  standalone: true,
})
export class NotLinkedDataComponent implements OnInit {
  constructor() {
    addIcons({
      navigateOutline,
      analyticsOutline,
      searchOutline,
      ellipsisHorizontalCircleOutline,
    });
  }

  ngOnInit() {}
}
