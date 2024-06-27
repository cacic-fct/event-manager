import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonButtons,
  IonTitle,
  IonToolbar,
  IonHeader,
  IonBackButton,
  IonContent,
  IonCard,
  IonItem,
  IonLabel,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-legal',
  templateUrl: './legal.page.html',
  styleUrls: ['./legal.page.scss'],
  standalone: true,
  imports: [
    IonLabel,
    IonItem,
    IonCard,
    IonContent,
    IonBackButton,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    CommonModule,
    FormsModule,
    RouterLink,
  ],
})
export class LegalPage {}
