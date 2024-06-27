import { ToastController } from '@ionic/angular/standalone';
import { Component, Input, OnInit } from '@angular/core';
import { Observable } from 'rxjs';

import { WeatherInfo, WeatherService } from '../../../services/weather.service';
import { DateService } from '../../../services/date.service';
import { CoursesService } from '../../../services/courses.service';
import { StringManagementService } from '../../../services/string-management.service';
import { EmojiService } from '../../../services/emoji.service';
import { EventItem } from '../../../services/event';
import { IonCardHeader, IonCardTitle, IonIcon, IonText } from '@ionic/angular/standalone';
import { DatePipe, AsyncPipe } from '@angular/common';

/**
 * Requires the eventItem input to be passed in.
 */
@Component({
  selector: 'app-event-header[eventItem]',
  templateUrl: './event-header.component.html',
  styleUrls: ['./event-header.component.scss'],
  standalone: true,
  imports: [IonCardHeader, IonCardTitle, IonIcon, IonText, DatePipe, AsyncPipe],
})
export class EventHeaderComponent implements OnInit {
  @Input() eventItem!: EventItem;
  @Input() displayWeather: boolean | undefined;

  weather: Observable<WeatherInfo> | undefined;
  weatherFailed = false;

  constructor(
    public coursesService: CoursesService,
    private toastController: ToastController,
    private weatherService: WeatherService,
    public dateService: DateService,
    public stringService: StringManagementService,
    public emojiService: EmojiService,
  ) {}

  ngOnInit() {
    if (
      this.displayWeather === true &&
      this.eventItem.location?.lat !== undefined &&
      this.eventItem.location?.lon !== undefined
    ) {
      this.weather = this.weatherService.getWeather(
        this.dateService.getDateFromTimestamp(this.eventItem.eventStartDate),
        this.eventItem.location.lat,
        this.eventItem.location.lon,
      );
    }
  }

  async presentToast() {
    const toast = await this.toastController.create({
      header: 'ID do evento',
      message: this.eventItem.id,
      icon: 'information-circle',
      position: 'bottom',
      duration: 5000,
      buttons: [
        {
          side: 'end',
          text: 'Copiar',
          handler: () => {
            if (this.eventItem.id) {
              navigator.clipboard.writeText(this.eventItem.id);
            }
          },
        },
        {
          side: 'end',
          text: 'Fechar',
          role: 'cancel',
        },
      ],
    });
    toast.present();
  }
}
