// @ts-strict-ignore
import { Component, inject, OnInit } from '@angular/core';

import { CoursesService } from '../../shared/services/courses.service';

import { ToastController } from '@ionic/angular';

import { ActivatedRoute, Router } from '@angular/router';

import { EventItem } from '../../shared/services/event';
import { take, Observable, map } from 'rxjs';
import { trace } from '@angular/fire/compat/performance';
import { AngularFirestore } from '@angular/fire/compat/firestore';

import { Analytics, logEvent } from '@angular/fire/analytics';

@Component({
  selector: 'app-page-calendar-event',
  templateUrl: './page-calendar-event.page.html',
  styleUrls: ['./page-calendar-event.page.scss'],
})
export class PageCalendarEventPage implements OnInit {
  private analytics: Analytics = inject(Analytics);
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
    this.eventID = this.route.snapshot.params.eventID;
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
    navigator.clipboard.writeText('https://fct-pp.web.app' + this.router.url);
    toast.present();

    logEvent(this.analytics, 'share', {
      content_type: 'event',
      item_id: this.eventID,
    });
  }
}
