import { Component, OnInit } from '@angular/core';
import { DisplayLicensesComponent } from './display-licenses/display-licenses.component';
import { MarkdownModule } from 'ngx-markdown';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent } from '@ionic/angular/standalone';

@Component({
  selector: 'app-licenses',
  templateUrl: './licenses.html',
  styleUrls: ['./licenses.page.scss'],
  standalone: true,
  imports: [
    MarkdownModule,
    DisplayLicensesComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
  ],
})
export class LicensesPage implements OnInit {
  constructor() {}

  ngOnInit() {}
}
