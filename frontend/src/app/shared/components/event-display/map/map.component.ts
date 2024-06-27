import { Component, Input, OnInit, OnDestroy, OnChanges } from '@angular/core';

import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import OSM from 'ol/source/OSM';
import Feature from 'ol/Feature';
import { Icon, Style } from 'ol/style';
import { useGeographic } from 'ol/proj';
import Point from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';

import { EventItem } from '../../../services/event';

import { IonItem, IonIcon, IonLabel } from '@ionic/angular/standalone';

/**
 * Requires the eventItem input to be passed in.
 */
@Component({
  selector: 'app-event-display-map[eventItem]',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
  standalone: true,
  imports: [IonItem, IonIcon, IonLabel],
})
export class MapComponent implements OnInit, OnDestroy, OnChanges {
  map: Map | undefined | null;
  @Input() eventItem!: EventItem;

  ngOnInit() {
    this.generateMap();
  }

  ngOnDestroy() {
    this.destroyMap();
  }

  ngOnChanges() {
    this.generateMap();
  }

  destroyMap() {
    if (this.map) {
      this.map.setTarget(undefined);
      this.map = null;
    }
  }

  generateMap() {
    if (this.eventItem.location?.lat && this.eventItem.location?.lon) {
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

      const iconFeature = new Feature({
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

      setTimeout(() => {
        this.destroyMap();
        this.map = new Map({
          view: new View({
            center: [this.eventItem.location!.lon!, this.eventItem.location!.lat!],
            zoom: 18,
            maxZoom: 19,
            projection: 'EPSG:3857',
          }),
          layers: [rasterLayer, vectorLayer],
          target: 'ol-map',
        });
      }, 500);
    }
  }
}
