import { Component, OnInit } from '@angular/core';

import { CoursesService } from '../shared/services/courses.service';

import { ToastController } from '@ionic/angular';

import { fromUnixTime } from 'date-fns';
import { ClipboardService } from 'ngx-clipboard';
import { Router } from '@angular/router';

import { DomSanitizer } from '@angular/platform-browser';
import { parse } from 'twemoji-parser';

import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import OSM from 'ol/source/OSM';
import Feature from 'ol/Feature';
import { Icon, Style } from 'ol/style';
import { fromLonLat, useGeographic } from 'ol/proj';
import { Control, defaults as defaultControls } from 'ol/control';
import Point from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';

@Component({
  selector: 'app-page-calendar-event',
  templateUrl: './page-calendar-event.page.html',
  styleUrls: ['./page-calendar-event.page.scss'],
})
export class PageCalendarEventPage implements OnInit {
  courses = CoursesService.courses;

  item: any;
  map: Map;

  constructor(
    private toastController: ToastController,
    private clipboardService: ClipboardService,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.item = history.state.item;
    if (this.item === undefined) {
      this.router.navigate(['/calendario']);
    }
  }

  ionViewWillEnter() {
    useGeographic();
    const iconStyle = new Style({
      image: new Icon({
        anchor: [0.5, 1],
        scale: 0.5,
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
        src: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
      }),
    });

    let iconFeature = new Feature({
      geometry: new Point([this.item.location?.lon, this.item.location?.lat]),
      name: this.item?.name,
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
        center: [this.item.location?.lon, this.item.location?.lat],
        zoom: 18,
        maxZoom: 19,
        projection: 'EPSG:3857',
      }),
      layers: [rasterLayer, vectorLayer],
      target: 'ol-map',
    });
  }

  ionViewWillLeave() {
    // Remove map on leave
    this.map.setTarget(null);
    this.map = null;
  }

  getCourse(): string {
    if (this.courses[this.item.course]) {
      return this.courses[this.item.course].name;
    }
    return '';
  }

  getDateFromTimestamp(timestamp: any): Date {
    return fromUnixTime(timestamp.seconds);
  }

  toUppercase(string: string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  async presentToast() {
    const toast = await this.toastController.create({
      header: 'ID do evento',
      message: this.item.id,
      icon: 'information-circle',
      position: 'bottom',
      duration: 5000,
      buttons: [
        {
          side: 'end',
          text: 'Copiar',
          handler: () => {
            this.clipboardService.copy(this.item.id);
          },
        },
        {
          side: 'end',
          text: 'Fechar',
          role: 'cancel',
        },
      ],
    });
    await toast.present();
  }

  getEmoji(emoji: string): any {
    if (emoji === undefined) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(parse('❔')[0].url);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(parse(emoji)[0].url);
  }
}
