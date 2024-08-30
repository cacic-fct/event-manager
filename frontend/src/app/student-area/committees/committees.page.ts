import { Component, inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonCard,
  IonCardTitle,
  IonCardHeader,
  IonCardContent,
  IonButton,
  IonButtons,
  IonBackButton,
  ModalController,
  IonIcon,
} from '@ionic/angular/standalone';

import { CommitteeMembersModalComponent } from 'src/app/student-area/committees/committee-members-modal/committee-members-modal.component';
import { Committee, CommitteesService } from 'src/app/shared/services/committees.service';
import { addIcons } from 'ionicons';
import { mail } from 'ionicons/icons';
import { Mailto, MailtoService } from 'src/app/shared/services/mailto.service';

@Component({
  selector: 'app-committees',
  templateUrl: './committees.page.html',
  styleUrls: ['./committees.page.scss'],
  standalone: true,
  imports: [
    IonIcon,
    IonBackButton,
    IonButtons,
    IonButton,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonCard,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
  ],
})
export class CommitteesPage {
  modalController = inject(ModalController);
  committeesService = inject(CommitteesService);
  document = inject(DOCUMENT);
  mailtoService = inject(MailtoService);

  constructor() {
    addIcons({
      mail,
    });
  }

  async openModal(committee: Committee) {
    const modal = await this.modalController.create({
      component: CommitteeMembersModalComponent,
      componentProps: {
        committee: committee,
      },
    });
    modal.present();
  }

  contact(committee: Committee) {
    if (!committee.contact) {
      return;
    }

    if (committee.contact.type === 'email') {
      this.mailtoCommittee(committee);
    } else if (committee.contact.type === 'whatsapp') {
      this.document.location.href = `https://wa.me/${committee.contact.value}`;
    } else if (committee.contact.type === 'url') {
      this.document.location.href = committee.contact.value;
    } else {
      throw new Error('Invalid contact type');
    }
  }

  mailtoCommittee(committee: Committee): void {
    const mailto: Mailto = {
      receiver: committee.contact?.value,
      subject: `[${committee.name}] Contato com a comissão`,
    };
    this.mailtoService.open(mailto);
  }
}
