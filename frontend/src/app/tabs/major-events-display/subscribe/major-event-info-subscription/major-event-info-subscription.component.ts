import { Component, Input } from '@angular/core';
import { MajorEventItem } from 'src/app/shared/services/major-event.service';
import { IonCardHeader, IonItem, IonIcon, IonCardContent, IonCardTitle, IonLabel } from '@ionic/angular/standalone';
import { DateService } from 'src/app/shared/services/date.service';
import { EnrollmentTypesService } from 'src/app/shared/services/enrollment-types.service';
import { CurrencyPipe, DatePipe } from '@angular/common';

@Component({
  selector: 'app-major-event-info-subscription',
  templateUrl: './major-event-info-subscription.component.html',
  styleUrls: ['./major-event-info-subscription.component.scss'],
  standalone: true,
  imports: [CurrencyPipe, DatePipe, IonCardContent, IonIcon, IonCardHeader, IonItem, IonCardTitle, IonLabel],
})
export class MajorEventInfoSubscriptionComponent {
  @Input({ required: true }) majorEvent!: MajorEventItem;

  constructor(
    public dateService: DateService,
    public enrollmentTypes: EnrollmentTypesService,
  ) {}
}
