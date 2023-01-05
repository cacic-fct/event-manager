import { AfterViewInit, Component, OnInit } from '@angular/core';
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
export class TabMapPage implements AfterViewInit {
  map: Map | undefined | null;

  constructor() {}

  ngAfterViewInit() {
    useGeographic();
    const rasterLayer = new TileLayer({
      source: new OSM(),
    });

    setTimeout(() => {
      this.map = new Map({
        view: new View({
          center: [-51.40775, -22.12103],
          zoom: 18,
          maxZoom: 19,
          projection: 'EPSG:3857',
        }),
        layers: [rasterLayer],
        target: 'ol-map-tab',
      });
    }, 500);
  }

  ngOnDestroy() {
    // Remove map on leave if it exists
    if (this.map) {
      this.map.setTarget(undefined);
      this.map = null;
    }
  }
}
