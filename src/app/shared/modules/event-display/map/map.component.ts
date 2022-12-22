import { Component, Input, OnInit } from '@angular/core';

import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import OSM from 'ol/source/OSM';
import Feature from 'ol/Feature';
import { Icon, Style } from 'ol/style';
import { fromLonLat, useGeographic } from 'ol/proj';
import Point from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';

import { EventItem } from '../../../services/event';

/**
 * Requires the eventItem input to be passed in.
 */
@Component({
  selector: 'app-event-display-map[eventItem]',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
})
export class MapComponent implements OnInit {
  map: Map | undefined | null;
  @Input() eventItem!: EventItem;

  constructor() {}

  ngOnInit() {
    this.generateMap();
  }

  ngOnDestroy() {
    // Remove map on leave if it exists
    if (this.map) {
      this.map.setTarget(undefined);
      this.map = null;
    }
  }

  ngOnChanges() {
    if (this.map) {
      this.map.setTarget(undefined);
      this.map = null;
    }
    this.generateMap();
  }

  generateMap() {
    if (this.eventItem.location?.lat !== undefined && this.eventItem.location?.lon !== undefined) {
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

      let iconFeature = new Feature({
        geometry: new Point([this.eventItem.location.lon, this.eventItem.location.lat]),
        name: this.eventItem.name,
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
          center: [this.eventItem.location.lon, this.eventItem.location.lat],
          zoom: 18,
          maxZoom: 19,
          projection: 'EPSG:3857',
        }),
        layers: [rasterLayer, vectorLayer],
        target: 'ol-map',
      });
    }
  }
}
