import { Component, OnInit } from '@angular/core';
import { IonItem, IonIcon, IonLabel, IonList, IonNote } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { analyticsOutline, fingerPrintOutline, idCardOutline, searchOutline } from 'ionicons/icons';

@Component({
  selector: 'app-tracking-data',
  templateUrl: './tracking-data.component.html',
  styleUrls: ['./tracking-data.component.scss'],
  standalone: true,
  imports: [IonNote, IonList, IonItem, IonIcon, IonLabel],
})
export class TrackingDataComponent implements OnInit {
  constructor() {
    addIcons({
      fingerPrintOutline,
      searchOutline,
      analyticsOutline,
      idCardOutline,
    });
  }

  ngOnInit() {}
}
