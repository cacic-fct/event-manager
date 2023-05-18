// @ts-strict-ignore
import { Component, Input, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { formatDate } from '@angular/common';

import { MajorEventItem } from '../../shared/services/major-event.service';
import { EventItem } from '../../shared/services/event';
import { ModalController } from '@ionic/angular';
import { Observable } from 'rxjs';
import { EnrollmentTypesService } from 'src/app/shared/services/enrollment-types.service';

import { EmojiService } from './../../shared/services/emoji.service';
import { DateService } from 'src/app/shared/services/date.service';

@Component({
  selector: 'app-confirm-modal',
  templateUrl: './confirm-modal.component.html',
  styleUrls: ['./confirm-modal.component.scss'],
})
export class ConfirmModalComponent implements OnInit {
  @Input() majorEvent$: Observable<MajorEventItem>;
  @Input() eventsSelected: EventItem[];
  @Input() minicursosCount: number;
  @Input() palestrasCount: number;
  @Input() subscriptionType: string;

  constructor(
    public afs: AngularFirestore,
    private modalController: ModalController,
    public enrollmentTypes: EnrollmentTypesService,
    public emojiService: EmojiService,
    public dateService: DateService
  ) {}

  ngOnInit() {}

  formatDate(date: Date): string {
    let formated = formatDate(date, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');

    formated = formated.charAt(0).toUpperCase() + formated.slice(1);
    return formated;
  }

  onSubmit() {
    this.modalController.dismiss(true);
  }

  closeModal() {
    this.modalController.dismiss(false);
  }
}
