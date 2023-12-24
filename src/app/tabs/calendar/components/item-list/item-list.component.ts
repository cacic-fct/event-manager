import { Component, Input, OnInit } from '@angular/core';
import { EventItem } from '../../../../shared/services/event';
import { EmojiService } from '../../../../shared/services/emoji.service';
import { CoursesService } from 'src/app/shared/services/courses.service';
import { NavController } from '@ionic/angular/standalone';

import { DateService } from 'src/app/shared/services/date.service';

import { IonItem, IonLabel } from '@ionic/angular/standalone';
import { DatePipe } from '@angular/common';

/**
 * Requires the eventItem input to be passed in.
 */
@Component({
  selector: 'app-event-item-list[eventItem]',
  templateUrl: './item-list.component.html',
  styleUrls: ['./item-list.component.scss'],
  standalone: true,
  imports: [IonItem, IonLabel, DatePipe],
})
export class ItemListComponent implements OnInit {
  courses = CoursesService.courses;

  @Input()
  eventItem!: EventItem;

  constructor(public emojiService: EmojiService, private navCtrl: NavController, public dateService: DateService) {}

  ngOnInit() {}

  public openItem(item: any): void {
    this.navCtrl.navigateForward(['calendario/evento', item.id], {
      state: { item: item },
    });
  }
}
