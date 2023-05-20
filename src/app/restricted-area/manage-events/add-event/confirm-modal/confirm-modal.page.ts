// @ts-strict-ignore
import { FormGroup } from '@angular/forms';
import { Component, Input, OnInit } from '@angular/core';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { ModalController } from '@ionic/angular';
import { EmojiService } from '../../../../shared/services/emoji.service';
import { StringManagementService } from '../../../../shared/services/string-management.service';
import { DateService } from 'src/app/shared/services/date.service';

@Component({
  selector: 'app-confirm-modal',
  templateUrl: './confirm-modal.page.html',
  styleUrls: ['./confirm-modal.page.scss'],
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
  }

  closeModal() {
    this.modalController.dismiss(false);
  }
}
