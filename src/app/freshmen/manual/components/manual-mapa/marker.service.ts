// @ts-strict-ignore
import Map from 'ol/Map';
import { Injectable } from '@angular/core';
import GeoJSON from 'ol/format/GeoJSON';
import { Fill, Icon, Stroke, Style } from 'ol/style';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import VectorSource from 'ol/source/Vector';
import Overlay from 'ol/Overlay';

@Injectable({
  providedIn: 'root',
})
export class MarkerService {
  layers: Array<string> = ['mercados', 'compras', 'hospitais', 'farmacias', 'autoridades'];

  mercadosIcon = new Style({
    image: new Icon({
      anchor: [0.5, 1],
      scale: 0.5,
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
      src: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-blue.png',
    }),
    stroke: new Stroke({
      color: '#3274A3',
      width: 7,
    }),
  });

  comprasIcon = new Style({
    image: new Icon({
      anchor: [0.5, 1],
      scale: 0.5,
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
      src: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-gold.png',
    }),
    stroke: new Stroke({
      color: '#C1A32D',
      width: 7,
    }),
  });

  hospitaisIcon = new Style({
    image: new Icon({
      anchor: [0.5, 1],
      scale: 0.5,
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
      src: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-red.png',
    }),
    stroke: new Stroke({
      color: '#982E40',
      width: 7,
    }),
  });

  farmaciasIcon = new Style({
    image: new Icon({
      anchor: [0.5, 1],
      scale: 0.5,
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
      src: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-orange.png',
    }),
    stroke: new Stroke({
      color: '#98652E',
      width: 7,
    }),
  });

  autoridadesIcon = new Style({
    image: new Icon({
      anchor: [0.5, 1],
      scale: 0.5,
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
      src: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-grey.png',
    }),
    stroke: new Stroke({
      color: '#6B6B6B',
      width: 7,
    }),
  });

  constructor() {}

  makeGroceriesMarkers(map: Map): void {
    // For each layer create a geojson layer with markers and polygons.
    // Mercados style is mercadosIcon and mercadosStyle.
    // Compras style is comprasIcon and comprasStyle.
    // bindPopup of markers and polygons to "<b>feature.properties.name</b><br>feature.properties.description"
    this.layers.forEach((layer) => {
      const vectorSource = new VectorSource({
        url: `https://cdn.jsdelivr.net/gh/cacic-fct/manual-do-calouro@main/map/${layer}.geojson`,
        format: new GeoJSON(),
      });

      const vectorLayer = new VectorLayer({
        source: vectorSource,
        style: (feature) => {
          switch (layer) {
            case 'mercados':
              return this.mercadosIcon;
            case 'compras':
              return this.comprasIcon;
            case 'hospitais':
              return this.hospitaisIcon;
            case 'farmacias':
              return this.farmaciasIcon;
            case 'autoridades':
              return this.autoridadesIcon;
            default:
              return null;
          }
        },
      });

      const popup = document.getElementById('popup');
      const popupOverlay = new Overlay({
        element: popup,
        /*autoPan: true,
        autoPanAnimation: {
          duration: 250,
        },*/
      });

      map.addOverlay(popupOverlay);

      map.on('singleclick', (event) => {
        map.forEachFeatureAtPixel(
          event.pixel,
          (feature) => {
            popup.innerHTML = `<b>${feature.get('name')}</b><br>${feature.get('description') || ''}
          ${
            feature.get('maps')
              ? `<br><a href="https://goo.gl/maps/${feature.get('maps')}" target="_blank">Mais informações</a>`
              : ''
          }
          `;
            popup.hidden = false;
            popupOverlay.setPosition(event.coordinate);
          },
          { hitTolerance: 6 }
        );
      });

      map.on('movestart', () => {
        popup.hidden = true;
      });

      map.on('pointermove', function (e) {
        const pixel = map.getEventPixel(e.originalEvent);
        const hit = map.hasFeatureAtPixel(pixel);
        const target: any = map.getTarget();
        const element = document.getElementById(target);
        element.style.cursor = hit ? 'pointer' : '';
      });

      map.addLayer(vectorLayer);
    });
  }
}
