import { EventItem } from 'src/app/shared/services/event';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { ModalController } from '@ionic/angular/standalone';
import { FormGroup, FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Timestamp } from '@firebase/firestore';
import { DateService } from 'src/app/shared/services/date.service';
import { EmojiService } from '../../../../shared/services/emoji.service';
import { Component, Input, OnInit } from '@angular/core';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonGrid,
  IonRow,
  IonCol,
} from '@ionic/angular/standalone';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-group-creation-modal',
  templateUrl: './group-creation-modal.component.html',
  styleUrls: ['./group-creation-modal.component.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonInput,
    IonGrid,
    IonRow,
    IonCol,
    DatePipe,
    ReactiveFormsModule,
  ],
})
export class GroupCreationModalComponent implements OnInit {
  @Input() eventGroup!: Array<{
    id: string;
    name: string;
    icon: string;
    eventStartDate: Timestamp;
    eventEndDate: Timestamp;
  }>;

  dataForm: FormGroup;

  constructor(
    public emojiService: EmojiService,
    public dateService: DateService,
    private formBuilder: FormBuilder,
    private modalController: ModalController,
    private afs: AngularFirestore
  ) {
    this.dataForm = this.formBuilder.group({
      groupDisplayName: ['', Validators.required],
    });
  }

  ngOnInit() {
    this.eventGroup.sort((a, b) => {
      return a.eventStartDate.seconds - b.eventStartDate.seconds;
    });
  }

  closeModal() {
    this.modalController.dismiss();
  }

  createGroup() {
    let count = 0;
    this.eventGroup.forEach((event) => {
      this.afs
        .collection('events')
        .doc<EventItem>(event.id)
        .update({
          eventGroup: {
            mainEventID: this.eventGroup[0].id,
            groupEventIDs: this.eventGroup.map((event) => {
              return event.id;
            }),
            groupDisplayName: this.dataForm.value.groupDisplayName,
          },
        })
        .then(() => {
          count++;
          if (count === this.eventGroup.length) {
            this.modalController.dismiss();
          }
        });
    });
  }
}
