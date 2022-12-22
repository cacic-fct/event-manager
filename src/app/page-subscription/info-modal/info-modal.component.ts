// @ts-strict-ignore
import { ModalController } from '@ionic/angular';
import { Component, Input, OnInit } from '@angular/core';
import { EventItem } from 'src/app/shared/services/event';

@Component({
  selector: 'app-info-modal',
  templateUrl: './info-modal.component.html',
  styleUrls: ['./info-modal.component.scss'],
})
export class InfoModalComponent implements OnInit {
  @Input() event: EventItem;

  constructor(private modalController: ModalController) {}

  ngOnInit() {}

  closeModal() {
    this.modalController.dismiss();
  }
}
