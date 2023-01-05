import { Component, AfterViewInit } from '@angular/core';
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
export class PageManualCalouroPage implements AfterViewInit {
  map: Map | undefined | null;
  constructor(private markerService: MarkerService) {}

  ngAfterViewInit() {
    useGeographic();
    const rasterLayer = new TileLayer({
      source: new OSM(),
    });

    setTimeout(() => {
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
    }, 500);
  }

  ngOnDestroy() {
    // Remove map on leave if it exists
    if (this.map) {
      this.map.setTarget(undefined);
      this.map = null;
    }
  }

  reloadMap() {
    this.map?.updateSize();
  }
}
