// @ts-strict-ignore
import { FormGroup } from '@angular/forms';
import { Component, Input } from '@angular/core';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { ModalController } from '@ionic/angular/standalone';
import { EmojiService } from '../../../../shared/services/emoji.service';
import { StringManagementService } from '../../../../shared/services/string-management.service';
import { DateService } from 'src/app/shared/services/date.service';

import { IonContent, IonItem, IonIcon, IonLabel, IonButton, IonGrid, IonRow, IonCol } from '@ionic/angular/standalone';
import { SafePipe } from 'src/app/shared/pipes/safe.pipe';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-confirm-modal',
  templateUrl: './confirm-add-event-modal.page.html',
  styleUrls: ['./confirm-add-event-modal.page.scss'],
  standalone: true,
  imports: [IonContent, IonItem, IonIcon, IonLabel, IonButton, IonGrid, IonRow, IonCol, SafePipe, DatePipe],
})
export class ConfirmAddEventModalPage {
  // TODO: Review any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @Input() dataForm: FormGroup<any>;
  @Input() hasDateEnd: boolean;

  constructor(
    public modalController: ModalController,
    public emojiService: EmojiService,
    public coursesService: CoursesService,
    public stringService: StringManagementService,
    public dateService: DateService
  ) {}

  onSubmit() {
    this.modalController.dismiss(true);
    return;
  }

  closeModal() {
    this.modalController.dismiss(false);
    return;
  }
}
