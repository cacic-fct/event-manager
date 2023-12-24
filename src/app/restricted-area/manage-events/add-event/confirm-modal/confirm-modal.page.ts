// @ts-strict-ignore
import { FormGroup } from '@angular/forms';
import { Component, Input, OnInit } from '@angular/core';
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
  templateUrl: './confirm-modal.page.html',
  styleUrls: ['./confirm-modal.page.scss'],
  standalone: true,
  imports: [IonContent, IonItem, IonIcon, IonLabel, IonButton, IonGrid, IonRow, IonCol, SafePipe, DatePipe],
})
export class ConfirmModalPage implements OnInit {
  @Input() dataForm: FormGroup<any>;
  @Input() hasDateEnd: boolean;

  constructor(
    public modalController: ModalController,
    public emojiService: EmojiService,
    public coursesService: CoursesService,
    public stringService: StringManagementService,
    public dateService: DateService
  ) {}

  ngOnInit() {}

  onSubmit() {
    this.modalController.dismiss(true);
    return;
  }

  closeModal() {
    this.modalController.dismiss(false);
    return;
  }
}
