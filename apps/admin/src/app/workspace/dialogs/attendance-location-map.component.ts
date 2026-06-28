import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';

type MapInstance = {
  setTarget(target: HTMLElement | undefined): void;
  updateSize(): void;
};

@Component({
  selector: 'app-attendance-location-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #mapTarget class="map-preview" [attr.aria-label]="ariaLabel()"></div>`,
  styles: `
    :host {
      display: block;
    }

    .map-preview {
      aspect-ratio: 16 / 9;
      background: color-mix(in srgb, currentColor 8%, transparent);
      border-radius: 8px;
      overflow: hidden;
      width: 100%;
    }
  `,
})
export class AttendanceLocationMapComponent implements OnDestroy {
  readonly latitude = input<number | null | undefined>(null);
  readonly longitude = input<number | null | undefined>(null);
  readonly accuracyMeters = input<number | null | undefined>(null);
  readonly markerLabel = input<string>('');
  readonly ariaLabel = input('Mapa do local onde a presença foi coletada');

  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly mapTarget = viewChild<ElementRef<HTMLDivElement>>('mapTarget');
  private readonly markerIconUrl = this.isBrowser
    ? new URL('assets/shared/pin.svg', this.document.baseURI).toString()
    : '';

  private map: MapInstance | null = null;
  private hasRendered = false;
  private renderVersion = 0;

  private readonly location = computed(() => {
    const latitude = this.latitude();
    const longitude = this.longitude();

    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
      return null;
    }

    return { latitude, longitude };
  });

  constructor() {
    afterNextRender(() => {
      this.hasRendered = true;
      void this.renderMap();
    });

    effect(() => {
      this.location();
      this.accuracyMeters();
      this.markerLabel();

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
    const location = this.location();

    if (!target || !location) {
      this.destroyMap();
      return;
    }

    const version = ++this.renderVersion;

    const [
      { default: Feature },
      { default: Map },
      { default: View },
      { default: Circle },
      { default: Point },
      { Tile: TileLayer, Vector: VectorLayer },
      { fromLonLat },
      { default: OSM },
      { default: VectorSource },
      { Fill, Icon, Stroke, Style },
    ] = await Promise.all([
      import('ol/Feature'),
      import('ol/Map'),
      import('ol/View'),
      import('ol/geom/Circle'),
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

    const center = fromLonLat([location.longitude, location.latitude]);
    const features = [];
    const accuracy = this.accuracyMeters();

    if (accuracy !== null && accuracy !== undefined && accuracy > 0) {
      const accuracyCircle = new Feature({
        geometry: new Circle(center, accuracy),
      });

      accuracyCircle.setStyle(
        new Style({
          fill: new Fill({ color: 'rgba(25, 118, 210, 0.14)' }),
          stroke: new Stroke({ color: 'rgba(25, 118, 210, 0.7)', width: 2 }),
        }),
      );
      features.push(accuracyCircle);
    }

    const marker = new Feature({
      geometry: new Point(center),
      name: this.markerLabel(),
    });

    marker.setStyle(
      new Style({
        image: new Icon({
          anchor: [400, 700],
          anchorXUnits: 'pixels',
          anchorYUnits: 'pixels',
          src: this.markerIconUrl,
          scale: 0.065,
        }),
      }),
    );
    features.push(marker);

    const view = new View({
      center,
      zoom: 17,
      maxZoom: 19,
    });

    this.map = new Map({
      target,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        new VectorLayer({
          source: new VectorSource({
            features,
          }),
        }),
      ],
      view,
      controls: [],
    });

    if (accuracy !== null && accuracy !== undefined && accuracy > 0) {
      view.fit(new Circle(center, accuracy).getExtent(), {
        maxZoom: 18,
        padding: [40, 40, 40, 40],
      });
    }

    requestAnimationFrame(() => this.map?.updateSize());
  }

  private destroyMap(): void {
    if (!this.map) {
      return;
    }

    this.map.setTarget(undefined);
    this.map = null;
  }
}
