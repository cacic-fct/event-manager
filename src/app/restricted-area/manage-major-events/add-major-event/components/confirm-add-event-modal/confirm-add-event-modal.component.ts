import { Component, Input, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { parseISO, getUnixTime } from 'date-fns';

import { ModalController } from '@ionic/angular/standalone';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { Timestamp } from '@firebase/firestore';

import {
  IonIcon,
  IonItem,
  IonLabel,
  IonButton,
  IonGrid,
  IonRow,
  IonCol,
  IonCardContent,
} from '@ionic/angular/standalone';
import { MajorEventHeaderComponent } from 'src/app/shared/components/major-event-display/major-event-header/major-event-header.component';
import { MajorEventDescriptionComponent } from 'src/app/shared/components/major-event-display/major-event-description/major-event-description.component';
import { DateComponent } from 'src/app/shared/components/major-event-display/date/date.component';
import { PriceComponent } from 'src/app/shared/components/major-event-display/price/price.component';

@Component({
  selector: 'app-confirm-add-event-modal[dataForm][isEventPaid]',
  templateUrl: './confirm-add-event-modal.component.html',
  styleUrls: ['./confirm-add-event-modal.component.scss'],
  standalone: true,
  imports: [
    IonIcon,
    IonItem,
    IonLabel,
    IonButton,
    IonGrid,
    IonRow,
    IonCol,
    IonCardContent,
    MajorEventHeaderComponent,
    MajorEventDescriptionComponent,
    DateComponent,
    PriceComponent,
  ],
})
export class ConfirmAddEventModalComponent implements OnInit {
  // TODO: Review any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @Input() dataForm!: FormGroup<any>;
  @Input() isEventPaid!: boolean;

  majorEventItem!: MajorEventItem;
  constructor(private modalController: ModalController) {}

  ngOnInit() {
    this.majorEventItem = {
      name: this.dataForm.value.name,
      description: this.dataForm.value.description,
      eventStartDate: new Timestamp(getUnixTime(parseISO(this.dataForm.value.eventStartDate)), 0),
      eventEndDate: new Timestamp(getUnixTime(parseISO(this.dataForm.value.eventEndDate)), 0),
      subscriptionStartDate: new Timestamp(getUnixTime(parseISO(this.dataForm.value.subscriptionStartDate)), 0),
      subscriptionEndDate: new Timestamp(getUnixTime(parseISO(this.dataForm.value.subscriptionEndDate)), 0),
      price: {
        single: this.dataForm.value.priceSingle,
        isFree: this.isEventPaid,
        students: this.dataForm.value.priceStudents,
        otherStudents: this.dataForm.value.priceOtherStudents,
        professors: this.dataForm.value.priceProfessors,
      },
      course: this.dataForm.value.course,
      createdBy: '',
      createdOn: new Timestamp(0, 0),
      public: false,
      events: [],
    };
  }

  getDateFromISO(isoString: string): Date {
    return parseISO(isoString);
  }

  onSubmit() {
    this.modalController.dismiss(true);
    return;
  }

  closeModal() {
    this.modalController.dismiss(false);
    return;
  }
}
