import { Component, inject, Input, OnInit } from '@angular/core';
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
export class ConfirmImageModalComponent implements OnInit {
  @Input({ required: true }) rawImage!: string;

  private readonly modalController: ModalController = inject(ModalController);
  constructor() {}

  ngOnInit() {}

  onSubmit() {
    this.modalController.dismiss(true);
  }

  closeModal() {
    this.modalController.dismiss(false);
  }
}
