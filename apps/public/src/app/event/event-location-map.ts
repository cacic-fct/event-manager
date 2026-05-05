import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  input,
  viewChild,
} from '@angular/core';
import Feature from 'ol/Feature';
import Map from 'ol/Map';
import View from 'ol/View';
import Point from 'ol/geom/Point';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { fromLonLat } from 'ol/proj';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import { Circle, Fill, Stroke, Style } from 'ol/style';

@Component({
  selector: 'app-event-location-map',
  template: '<div #mapTarget class="map-target" aria-hidden="true"></div>',
  styleUrl: './event-location-map.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventLocationMap implements OnDestroy {
  readonly latitude = input.required<number | null>();
  readonly longitude = input.required<number | null>();
  readonly title = input.required<string>();

  private readonly mapTarget =
    viewChild<ElementRef<HTMLDivElement>>('mapTarget');
  private map: Map | null = null;
  private renderVersion = 0;

  constructor() {
    afterNextRender(() => {
      if (this.latitude() !== null || this.longitude() !== null) {
        this.renderMap();
      }
    });

    effect(() => {
      this.latitude();
      this.longitude();
      this.title();

      if (this.map) {
        this.renderMap();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyMap();
  }

  private async renderMap(): Promise<void> {
    const target = this.mapTarget()?.nativeElement;
    if (!target || !this.longitude() || !this.latitude()) {
      return;
    }

    const version = (this.renderVersion += 1);
    this.destroyMap();

    if (version !== this.renderVersion) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const center = fromLonLat([this.longitude()!, this.latitude()!]);
    const marker = new Feature({
      geometry: new Point(center),
      name: this.title(),
    });
    marker.setStyle(
      new Style({
        image: new Circle({
          radius: 9,
          fill: new Fill({ color: '#1a73e8' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 }),
        }),
      }),
    );

    this.map = new Map({
      target,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        new VectorLayer({
          source: new VectorSource({
            features: [marker],
          }),
        }),
      ],
      view: new View({
        center,
        zoom: 17,
        maxZoom: 19,
      }),
      controls: [],
    });
  }

  private destroyMap(): void {
    if (!this.map) {
      return;
    }

    this.map.setTarget(undefined);
    this.map = null;
  }
}
