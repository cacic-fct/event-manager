import { Component, OnInit, AfterViewInit } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { useGeographic } from 'ol/proj';

import { MarkerService } from './components/manual-mapa/marker.service';

@Component({
  selector: 'app-page-manual-calouro',
  templateUrl: './page-manual-calouro.page.html',
  styleUrls: ['./page-manual-calouro.page.scss'],
})
export class PageManualCalouroPage implements OnInit, AfterViewInit {
  public map: Map;
  constructor(private markerService: MarkerService) {}

  ngAfterViewInit(): void {}

  ionViewWillEnter() {
    useGeographic();
    const rasterLayer = new TileLayer({
      source: new OSM(),
    });

    this.map = new Map({
      view: new View({
        center: [-51.40775, -22.12103],
        zoom: 15,
        maxZoom: 19,
        projection: 'EPSG:3857',
      }),
      layers: [rasterLayer],
      target: 'ol-map-manual',
    });

    this.markerService.makeGroceriesMarkers(this.map);
  }

  ionViewDidEnter() {}

  ionViewWillLeave() {}

  ngOnInit() {}
}
