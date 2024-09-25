import { Component, inject, Input } from '@angular/core';
import {
  IonHeader,
  IonContent,
  ModalController,
  IonButton,
  IonProgressBar,
  IonItemDivider,
  IonLabel,
  IonList,
  IonButtons,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-confirm-image-modal',
  templateUrl: './confirm-image-modal.component.html',
  styleUrls: ['./confirm-image-modal.component.scss'],
  imports: [
    IonToolbar,
    IonTitle,
    IonButtons,
    IonList,
    IonLabel,
    IonItemDivider,
    IonProgressBar,
    IonButton,
    IonContent,
    IonHeader,
  ],
  standalone: true,
})
export class ConfirmImageModalComponent {
  @Input({ required: true }) rawImage!: string;

  private readonly modalController: ModalController = inject(ModalController);

  onSubmit() {
    this.modalController.dismiss(true);
  }

  closeModal() {
    this.modalController.dismiss(false);
  }
}
