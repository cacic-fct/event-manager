import { Component } from '@angular/core';

import * as L from 'leaflet';
import 'leaflet-easybutton';

@Component({
  selector: 'app-tab-map',
  templateUrl: 'tab-map.page.html',
  styleUrls: ['tab-map.page.scss'],
})
export class TabMapPage {
  private map: L.Map;

  constructor() {}

  ngOnInit() {}

  ionViewWillEnter() {
    this.leafletMap();
  }

  ionViewWillLeave() {
    // Remove map on leave
    //this.map.remove();
  }

  leafletMap() {
    let home = {
      lat: -22.12103,
      lng: -51.40775,
      zoom: 18,
    };

    this.map = L.map('mapId').setView([home.lat, home.lng], home.zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);

    L.easyButton('<ion-icon name="school"></ion-icon>', () => {
      this.map.setView([home.lat, home.lng], home.zoom);
    }).addTo(this.map);

    L.map('mapId').invalidateSize();
  }
}
