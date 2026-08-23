import { isPlatformBrowser } from '@angular/common';
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
import { AttendanceHeatmapPoint } from '@cacic-fct/event-manager-admin-contracts';
import { OPENSTREETMAP_TILE_REFERRER_POLICY } from '@cacic-fct/shared-utils';
import Feature from 'ol/Feature';
import Map from 'ol/Map';
import View from 'ol/View';
import { boundingExtent } from 'ol/extent';
import Point from 'ol/geom/Point';
import type BaseLayer from 'ol/layer/Base';
import Heatmap from 'ol/layer/Heatmap';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat } from 'ol/proj';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';

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
export class AttendanceHeatmapComponent implements OnDestroy {
  readonly points = input<AttendanceHeatmapPoint[]>([]);
  readonly eventLatitude = input<number | null | undefined>();
  readonly eventLongitude = input<number | null | undefined>();
  readonly hasLocationData = computed(
    () => this.points().length > 0 || (this.eventLatitude() != null && this.eventLongitude() != null),
  );

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly mapTarget = viewChild<ElementRef<HTMLElement>>('mapTarget');
  private map: Map | null = null;
  private hasRendered = false;
  private mapRenderFrame?: number;

  constructor() {
    afterNextRender(() => {
      this.hasRendered = true;
      this.scheduleMapRender();
    });

    effect(() => {
      this.points();
      this.eventLatitude();
      this.eventLongitude();

      if (this.hasRendered) {
        this.scheduleMapRender();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.mapRenderFrame !== undefined) cancelAnimationFrame(this.mapRenderFrame);
    this.destroyMap();
  }

  private scheduleMapRender(): void {
    if (!this.isBrowser || this.mapRenderFrame !== undefined) return;

    this.mapRenderFrame = requestAnimationFrame(() => {
      this.mapRenderFrame = undefined;
      this.renderCurrentMap();
    });
  }

  private renderCurrentMap(): void {
    const target = this.mapTarget()?.nativeElement;
    const points = this.points();
    const eventLatitude = this.eventLatitude();
    const eventLongitude = this.eventLongitude();

    if (!this.isBrowser || !target) {
      this.destroyMap();
      return;
    }

    this.destroyMap();
    const maxCount = Math.max(1, ...points.map((point) => point.count));
    const heatFeatures = points.map((point) => {
      const feature = new Feature({ geometry: new Point(fromLonLat([point.longitude, point.latitude])) });
      feature.set('weight', Math.max(0.12, point.count / maxCount));
      return feature;
    });
    const projectedPoints = points.map((point) => fromLonLat([point.longitude, point.latitude]));
    const eventCenter = eventLatitude != null && eventLongitude != null
      ? fromLonLat([eventLongitude, eventLatitude])
      : null;
    const center = eventCenter ?? projectedPoints[0];
    const layers: BaseLayer[] = [
      new TileLayer({ source: new OSM({ referrerPolicy: OPENSTREETMAP_TILE_REFERRER_POLICY }) }),
      new Heatmap({
        source: new VectorSource({ features: heatFeatures }),
        blur: 24,
        radius: 18,
        weight: 'weight',
        gradient: ['#e8f5e9', '#81c784', '#fdd835', '#fb8c00', '#c62828'],
      }),
    ];

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
      layers.push(new VectorLayer({ source: new VectorSource({ features: [eventFeature] }) }));
    }

    const view = new View({ center, zoom: 17, maxZoom: 19 });
    this.map = new Map({
      target,
      layers,
      view,
      controls: [],
    });

    const visibleCoordinates = eventCenter ? [...projectedPoints, eventCenter] : projectedPoints;
    if (visibleCoordinates.length > 1) {
      view.fit(boundingExtent(visibleCoordinates), {
        maxZoom: 17,
        padding: [32, 32, 32, 32],
      });
    }
    requestAnimationFrame(() => this.map?.updateSize());
  }

  private destroyMap(): void {
    this.map?.setTarget(undefined);
    this.map = null;
  }
}
