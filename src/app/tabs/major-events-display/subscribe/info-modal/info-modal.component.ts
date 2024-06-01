// @ts-strict-ignore
import { ModalController } from '@ionic/angular/standalone';
import { Component, Input } from '@angular/core';
import { EventItem } from 'src/app/shared/services/event';
import { EventDescriptionComponent } from '../../../../shared/components/event-display/event-description/event-description.component';
import { EventHeaderComponent } from '../../../../shared/components/event-display/event-header/event-header.component';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonContent } from '@ionic/angular/standalone';

@Component({
  selector: 'app-info-modal',
  templateUrl: './info-modal.component.html',
  styleUrls: ['./info-modal.component.scss'],
  standalone: true,
  imports: [
    EventHeaderComponent,
    EventDescriptionComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
  ],
})
export class InfoModalComponent {
  @Input() event: EventItem;

  constructor(private modalController: ModalController) {
    addIcons({ closeOutline });
  }

  closeModal() {
    this.modalController.dismiss();
  }
}
