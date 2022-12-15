// @ts-strict-ignore
import { Component, Input, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { parseISO } from 'date-fns';

import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-confirm-modal',
  templateUrl: './confirm-modal.component.html',
  styleUrls: ['./confirm-modal.component.scss'],
})
export class ConfirmModalComponent implements OnInit {
  @Input() dataForm: FormGroup<any>;
  @Input() isEventPaid: boolean;
  constructor(private modalController: ModalController) {}

  ngOnInit() {}

  getDateFromISO(isoString: string): Date {
    return parseISO(isoString);
  }

  onSubmit() {
    this.modalController.dismiss(true);
  }

  closeModal() {
    this.modalController.dismiss(false);
  }
}
