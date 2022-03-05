import { Component, OnInit } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { useGeographic } from 'ol/proj';
import { Control, defaults as defaultControls } from 'ol/control';

useGeographic();

@Component({
  selector: 'app-tab-map',
  templateUrl: 'tab-map.page.html',
  styleUrls: ['tab-map.page.scss'],
})
export class TabMapPage implements OnInit {
  public map: Map;

  constructor() {}

  ngOnInit() {}

  ionViewWillEnter() {
    // Openlayers button
    this.map = new Map({
      view: new View({
        center: [-51.40775, -22.12103],
        zoom: 18,
        maxZoom: 19,
        projection: 'EPSG:3857',
      }),
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
      ],
      target: 'ol-map',
    });
  }

  ionViewWillLeave() {
    // Remove map on leave
  }
  /*
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
  }*/
}
