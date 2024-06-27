// @ts-strict-ignore
import { Component, inject, OnInit } from '@angular/core';

import { CoursesService } from '../../../shared/services/courses.service';

import { ToastController } from '@ionic/angular/standalone';

import { ActivatedRoute, Router } from '@angular/router';

import { EventItem } from '../../../shared/services/event';
import { Observable } from 'rxjs';
import { trace } from '@angular/fire/compat/performance';
import { AngularFirestore } from '@angular/fire/compat/firestore';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonProgressBar,
} from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';
import { EventHeaderComponent } from 'src/app/shared/components/event-display/event-header/event-header.component';
import { EventDescriptionComponent } from 'src/app/shared/components/event-display/event-description/event-description.component';
import { MapComponent } from 'src/app/shared/components/event-display/map/map.component';
import { ButtonsComponent } from 'src/app/shared/components/event-display/buttons/buttons.component';
import { environment } from 'src/environments/environment';
import { PlausibleService } from '@notiz/ngx-plausible';

@Component({
  selector: 'app-event-info-display',
  templateUrl: './event-info-display.page.html',
  styleUrls: ['./event-info-display.page.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonButton,
    IonIcon,
    IonContent,
    IonProgressBar,
    AsyncPipe,
    EventHeaderComponent,
    EventDescriptionComponent,
    MapComponent,
    ButtonsComponent,
  ],
})
export class EventInfoDisplayPage implements OnInit {
  private plausible: PlausibleService = inject(PlausibleService);
  courses = CoursesService.courses;
  item: EventItem;
  item$: Observable<EventItem>;
  eventID: string;

  constructor(
    private toastController: ToastController,
    private router: Router,
    private route: ActivatedRoute,
    private afs: AngularFirestore
  ) {}

  ngOnInit() {
    this.eventID = this.route.snapshot.params['eventID'];
    this.item$ = this.afs
      .doc<EventItem>(`events/${this.eventID}`)
      .valueChanges({ idField: 'id' })
      .pipe(trace('firestore'));
  }

  async presentToastShare() {
    const toast = await this.toastController.create({
      header: 'Compartilhar evento',
      message: 'Link copiado para a área de transferência.',
      icon: 'copy',
      position: 'bottom',
      duration: 2000,
      buttons: [
        {
          side: 'end',
          text: 'OK',
          role: 'cancel',
        },
      ],
    });
    const baseUrlNoSlash = environment.baseUrl.replace(/\/$/, '');
    navigator.clipboard.writeText(`${baseUrlNoSlash}${this.router.url}`);
    toast.present();

    this.plausible.event('Share Event', { props: { method: 'button', eventId: this.eventID } });
  }
}
