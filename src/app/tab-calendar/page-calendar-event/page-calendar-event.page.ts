import { Component, OnInit } from '@angular/core';

import { CoursesService } from '../../shared/services/courses.service';

import { ToastController } from '@ionic/angular';

import { fromUnixTime } from 'date-fns';
import { ClipboardService } from 'ngx-clipboard';
import { ActivatedRoute, Router } from '@angular/router';

import { DomSanitizer } from '@angular/platform-browser';
import { parse } from 'twemoji-parser';

import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import OSM from 'ol/source/OSM';
import Feature from 'ol/Feature';
import { Icon, Style } from 'ol/style';
import { fromLonLat, useGeographic } from 'ol/proj';
import Point from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';

import { AngularFirestore } from '@angular/fire/compat/firestore';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { AngularFireAuth } from '@angular/fire/compat/auth';

import { EventItem } from '../../shared/services/event';
import { take, Observable, map } from 'rxjs';
import { trace } from '@angular/fire/compat/performance';

import { Timestamp as TimestampType } from '@firebase/firestore-types';
import { Timestamp } from '@firebase/firestore';
import { WeatherInfo, WeatherService } from 'src/app/shared/services/weather.service';
import { serverTimestamp } from '@angular/fire/firestore';
@UntilDestroy()
@Component({
  selector: 'app-page-calendar-event',
  templateUrl: './page-calendar-event.page.html',
  styleUrls: ['./page-calendar-event.page.scss'],
})
export class PageCalendarEventPage implements OnInit {
  courses = CoursesService.courses;
  item: EventItem;
  item$: Observable<EventItem>;
  map: Map;
  weather: Observable<WeatherInfo>;
  weatherFailed: boolean = false;
  eventID: string;
  subscribedToEvent: boolean;
  isUserAuthenticated: Observable<boolean>;
  today: Date = new Date();

  constructor(
    private toastController: ToastController,
    private clipboardService: ClipboardService,
    private router: Router,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private afs: AngularFirestore,
    private auth: AngularFireAuth,
    private weatherService: WeatherService
  ) {}

  ngOnInit() {
    this.eventID = this.route.snapshot.params.eventID;
    this.item$ = this.afs
      .doc<EventItem>(`events/${this.eventID}`)
      .valueChanges({ idField: 'id' })
      .pipe(trace('firestore'));

    this.isUserAuthenticated = this.auth.user.pipe(
      trace('auth'),
      map((user) => {
        return !!user;
      })
    );

    // Check if user is already subscribed to event
    this.auth.user.pipe(take(1)).subscribe((user) => {
      if (user) {
        this.afs
          .doc(`events/${this.eventID}/subscriptions/${user.uid}`)
          .get()
          .subscribe((doc) => {
            this.subscribedToEvent = doc.exists;
          });
      }
    });
  }

  ionViewWillEnter() {
    // take(1) unsubscribes after the first value is emitted
    // This is necessary because the map would be created multiple times otherwise
    this.item$.pipe(take(1)).subscribe((item) => {
      if (item.location?.lat && item.location?.lon) {
        useGeographic();
        const iconStyle = new Style({
          image: new Icon({
            anchor: [0.5, 1],
            scale: 0.5,
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            src: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-blue.png',
          }),
        });

        this.weather = this.weatherService.getWeather(
          this.getDateFromTimestamp(item.eventStartDate),
          item.location.lat,
          item.location.lon
        );

        let iconFeature = new Feature({
          geometry: new Point([item.location.lon, item.location.lat]),
          name: item.name,
        });

        iconFeature.setStyle(iconStyle);

        const vectorSource = new VectorSource({
          features: [iconFeature],
        });

        const vectorLayer = new VectorLayer({
          source: vectorSource,
        });

        const rasterLayer = new TileLayer({
          source: new OSM(),
        });

        this.map = new Map({
          view: new View({
            center: [item.location.lon, item.location.lat],
            zoom: 18,
            maxZoom: 19,
            projection: 'EPSG:3857',
          }),
          layers: [rasterLayer, vectorLayer],
          target: 'ol-map',
        });
      }
    });
  }

  ionViewWillLeave() {
    // Remove map on leave if it exists
    if (this.map) {
      this.map.setTarget(null);
      this.map = null;
    }
  }

  getCourse(course: string): string {
    if (this.courses[course]) {
      return this.courses[course].name;
    }
    return '';
  }

  getDateFromTimestamp(timestamp: TimestampType): Date {
    return fromUnixTime(timestamp.seconds);
  }

  toUppercase(string: string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  async presentToast() {
    const toast = await this.toastController.create({
      header: 'ID do evento',
      message: this.eventID,
      icon: 'information-circle',
      position: 'bottom',
      duration: 5000,
      buttons: [
        {
          side: 'end',
          text: 'Copiar',
          handler: () => {
            this.clipboardService.copy(this.eventID);
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
    this.clipboardService.copy('https://fct-pp.web.app' + this.router.url);
    toast.present();
  }

  getEmoji(emoji: string): any {
    if (emoji === undefined || !/^\p{Emoji}|\p{Emoji_Modifier}$/u.test(emoji)) {
      // TODO: validar apenas 1 emoji
      return this.sanitizer.bypassSecurityTrustResourceUrl(parse('❔')[0].url);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(parse(emoji)[0].url);
  }

  subscribeToEvent() {
    // If event has eventGroup, subscribe to every item
    this.item$.pipe(take(1)).subscribe((item) => {
      if (item.eventGroup) {
        item.eventGroup.forEach((eventID) => {
          this.auth.user.subscribe((user) => {
            this.afs
              .doc(`events/${eventID}/subscriptions/${user.uid}`)
              .set({
                // @ts-ignore
                time: serverTimestamp(),
              })
              .then(() => {
                this.afs
                  .doc(`users/${user.uid}/eventSubscriptions/${eventID}`)
                  .set({
                    reference: this.afs.doc(`events/${eventID}`).ref,
                  })
                  .then(() => {
                    this.presentToastSubscribe();
                    this.subscribedToEvent = true;
                  });
              });
          });
        });
      } else {
        this.auth.user.subscribe((user) => {
          this.afs
            .doc(`events/${this.eventID}/subscriptions/${user.uid}`)
            .set({
              // @ts-ignore
              time: serverTimestamp(),
            })
            .then(() => {
              this.afs
                .doc(`users/${user.uid}/eventSubscriptions/${this.eventID}`)
                .set({
                  reference: this.afs.doc(`events/${this.eventID}`).ref,
                })
                .then(() => {
                  this.presentToastSubscribe();
                  this.subscribedToEvent = true;
                });
            });
        });
      }
    });
  }

  async presentToastSubscribe() {
    const toast = await this.toastController.create({
      header: 'Você se inscreveu no evento',
      icon: 'checkmark-circle',
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
    toast.present();
  }
}
