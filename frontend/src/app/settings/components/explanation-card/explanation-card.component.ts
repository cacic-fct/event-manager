import { Component, Input } from '@angular/core';
import { IonIcon, IonCard, IonLabel, IonCardTitle } from '@ionic/angular/standalone';

@Component({
  selector: 'app-explanation-card',
  templateUrl: './explanation-card.component.html',
  styleUrls: ['./explanation-card.component.scss'],
  standalone: true,
  imports: [IonCardTitle, IonIcon, IonCard, IonLabel],
})
export class ExplanationCardComponent {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) icon!: string;
}
