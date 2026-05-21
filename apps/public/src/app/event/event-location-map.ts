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

  private readonly mapTarget = viewChild<ElementRef<HTMLDivElement>>('mapTarget');

  private map: { setTarget(target: HTMLElement | undefined): void } | null = null;

  private hasRendered = false;
  private renderVersion = 0;

  constructor() {
    afterNextRender(() => {
      this.hasRendered = true;
      void this.renderMap();
    });

    effect(() => {
      this.latitude();
      this.longitude();
      this.title();

      if (this.hasRendered) {
        void this.renderMap();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyMap();
  }

  private async renderMap(): Promise<void> {
    const target = this.mapTarget()?.nativeElement;
    const latitude = this.latitude();
    const longitude = this.longitude();

    if (!target || latitude == null || longitude == null) {
      this.destroyMap();
      return;
    }

    const version = ++this.renderVersion;

    const [
      { default: Feature },
      { default: Map },
      { default: View },
      { default: Point },
      { Tile: TileLayer, Vector: VectorLayer },
      { fromLonLat },
      { default: OSM },
      { default: VectorSource },
      { Icon, Style },
    ] = await Promise.all([
      import('ol/Feature'),
      import('ol/Map'),
      import('ol/View'),
      import('ol/geom/Point'),
      import('ol/layer'),
      import('ol/proj'),
      import('ol/source/OSM'),
      import('ol/source/Vector'),
      import('ol/style'),
    ]);

    if (version !== this.renderVersion) {
      return;
    }

    this.destroyMap();

    const center = fromLonLat([longitude, latitude]);

    const marker = new Feature({
      geometry: new Point(center),
      name: this.title(),
    });

    marker.setStyle(
      new Style({
        image: new Icon({
          anchor: [400, 700],
          anchorXUnits: 'pixels',
          anchorYUnits: 'pixels',
          src: '/app/assets/shared/pin.svg',
          scale: 0.065,
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
