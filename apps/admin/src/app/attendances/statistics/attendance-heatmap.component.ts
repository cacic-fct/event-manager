import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  effect,
  inject,
  input,
} from '@angular/core';
import { AttendanceHeatmapPoint } from '@cacic-fct/event-manager-admin-contracts';
import type Map from 'ol/Map';
import type BaseLayer from 'ol/layer/Base';

@Component({
  selector: 'app-attendance-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (hasLocationData()) {
      <div
        #mapTarget
        class="attendance-heatmap"
        role="img"
        aria-label="Mapa de calor dos locais onde as presenças foram coletadas"></div>
    } @else {
      <div class="map-empty">
        <span class="material-symbols-outlined" aria-hidden="true">location_off</span>
        <p>Nenhuma presença desta janela contém localização.</p>
      </div>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .attendance-heatmap { width: 100%; min-height: 360px; background: var(--mat-sys-surface-container); }
    .map-empty { min-height: 280px; display: grid; place-content: center; justify-items: center; gap: 8px; color: var(--mat-sys-on-surface-variant); text-align: center; }
    .map-empty .material-symbols-outlined { font-size: 2rem; }
    .map-empty p { margin: 0; }
    @media (max-width: 720px) { .attendance-heatmap { min-height: 300px; } }
  `,
})
export class AttendanceHeatmapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapTarget') private mapTarget?: ElementRef<HTMLElement>;

  readonly points = input<AttendanceHeatmapPoint[]>([]);
  readonly eventLatitude = input<number | null | undefined>();
  readonly eventLongitude = input<number | null | undefined>();

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private map: Map | null = null;
  private renderVersion = 0;

  constructor() {
    effect(() => {
      this.points();
      this.eventLatitude();
      this.eventLongitude();
      queueMicrotask(() => void this.render());
    });
  }

  ngAfterViewInit(): void {
    void this.render();
  }

  ngOnDestroy(): void {
    this.destroyMap();
  }

  hasLocationData(): boolean {
    return this.points().length > 0 || (this.eventLatitude() != null && this.eventLongitude() != null);
  }

  private async render(): Promise<void> {
    if (!this.isBrowser || !this.mapTarget?.nativeElement || !this.hasLocationData()) return;
    const version = ++this.renderVersion;
    const [
      { default: Feature },
      { default: Map },
      { default: View },
      { default: Point },
      { default: Heatmap },
      { default: TileLayer },
      { fromLonLat },
      { default: OSM },
      { default: VectorSource },
      { Circle: CircleStyle, Fill, Stroke, Style },
    ] = await Promise.all([
      import('ol/Feature'),
      import('ol/Map'),
      import('ol/View'),
      import('ol/geom/Point'),
      import('ol/layer/Heatmap'),
      import('ol/layer/Tile'),
      import('ol/proj'),
      import('ol/source/OSM'),
      import('ol/source/Vector'),
      import('ol/style'),
    ]);
    if (version !== this.renderVersion || !this.mapTarget?.nativeElement) return;

    this.destroyMap();
    const points = this.points();
    const maxCount = Math.max(1, ...points.map((point) => point.count));
    const heatFeatures = points.map((point) => {
      const feature = new Feature({ geometry: new Point(fromLonLat([point.longitude, point.latitude])) });
      feature.set('weight', Math.max(0.12, point.count / maxCount));
      return feature;
    });
    const centerCoordinates = this.resolveCenter(points);
    const layers: BaseLayer[] = [
      new TileLayer({ source: new OSM() }),
      new Heatmap({
        source: new VectorSource({ features: heatFeatures }),
        blur: 24,
        radius: 18,
        weight: 'weight',
        gradient: ['#e8f5e9', '#81c784', '#fdd835', '#fb8c00', '#c62828'],
      }),
    ];

    const eventLatitude = this.eventLatitude();
    const eventLongitude = this.eventLongitude();
    if (eventLatitude != null && eventLongitude != null) {
      const eventFeature = new Feature({
        geometry: new Point(fromLonLat([eventLongitude, eventLatitude])),
      });
      eventFeature.setStyle(new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: '#ffffff' }),
          stroke: new Stroke({ color: '#1b5e20', width: 3 }),
        }),
      }));
      const { default: VectorLayer } = await import('ol/layer/Vector');
      layers.push(new VectorLayer({ source: new VectorSource({ features: [eventFeature] }) }));
    }

    this.map = new Map({
      target: this.mapTarget.nativeElement,
      layers,
      view: new View({ center: fromLonLat(centerCoordinates), zoom: points.length > 1 ? 15 : 17, maxZoom: 19 }),
      controls: [],
    });
    requestAnimationFrame(() => this.map?.updateSize());
  }

  private resolveCenter(points: AttendanceHeatmapPoint[]): [number, number] {
    const eventLatitude = this.eventLatitude();
    const eventLongitude = this.eventLongitude();
    if (eventLatitude != null && eventLongitude != null) {
      return [eventLongitude, eventLatitude];
    }
    const totalWeight = points.reduce((sum, point) => sum + point.count, 0) || 1;
    return [
      points.reduce((sum, point) => sum + point.longitude * point.count, 0) / totalWeight,
      points.reduce((sum, point) => sum + point.latitude * point.count, 0) / totalWeight,
    ];
  }

  private destroyMap(): void {
    this.map?.setTarget(undefined);
    this.map = null;
  }
}
