import { DestroyRef, Service, effect, inject } from '@angular/core';
import Feature from 'ol/Feature';
import Map from 'ol/Map';
import { EventsKey } from 'ol/events';
import Point from 'ol/geom/Point';
import { circular } from 'ol/geom/Polygon';
import VectorLayer from 'ol/layer/Vector';
import { unByKey } from 'ol/Observable';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { Circle, Fill, Icon, Stroke, Style } from 'ol/style';
import { PublicMapGeolocationService, PublicMapUserLocation } from './public-map-geolocation.service';

const LOCATION_BLUE = '#0b57d0';
const HIDDEN_STYLE = new Style();
const MIN_ACCURACY_CIRCLE_ZOOM = 14;

export type PublicUserLocationStartResult = Readonly<{ success: true }> | Readonly<{ success: false; error: string }>;

@Service()
export class PublicUserLocationLayerService {
  private readonly geolocation = inject(PublicMapGeolocationService);
  private readonly destroyRef = inject(DestroyRef);
  private map: Map | null = null;
  private source: VectorSource | null = null;
  private layer: VectorLayer<VectorSource> | null = null;
  private resolutionListener: EventsKey | null = null;
  private visible = false;

  constructor() {
    effect(() => {
      const location = this.geolocation.location();
      const orientation = this.geolocation.orientation();
      if (location && this.visible) {
        this.render(location, orientation?.heading ?? location.heading);
      }
    });
    this.destroyRef.onDestroy(() => this.destroy());
  }

  addToMap(map: Map): void {
    this.removeFromMap();
    this.map = map;
    this.source = new VectorSource();
    this.layer = new VectorLayer({
      source: this.source,
      zIndex: 1_000,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    });
    map.addLayer(this.layer);
    this.resolutionListener = map.getView().on('change:resolution', () => this.updateAccuracyVisibility());
  }

  async show(): Promise<boolean> {
    this.visible = true;
    const success = await this.geolocation.startTracking({ trackOrientation: true });
    if (!success) {
      this.visible = false;
      this.source?.clear();
      return false;
    }
    const location = this.geolocation.location();
    if (location) {
      this.render(location, this.geolocation.orientation()?.heading ?? location.heading);
    }
    return true;
  }

  async startAndCenter(map: Map, zoom = 18): Promise<PublicUserLocationStartResult> {
    if (this.map !== map) {
      this.addToMap(map);
    }
    if (!(await this.show()) || !(await this.centerOnUser(zoom))) {
      this.stopAndHide();
      return {
        success: false,
        error: this.geolocation.error()?.message ?? 'Não foi possível acessar sua localização.',
      };
    }
    return { success: true };
  }

  hide(): void {
    this.visible = false;
    this.geolocation.stopTracking();
    this.source?.clear();
  }

  stopAndHide(): void {
    this.hide();
  }

  async centerOnUser(zoom?: number): Promise<boolean> {
    const location = this.geolocation.location() ?? (await this.geolocation.requestLocation());
    if (!location || !this.map) {
      return false;
    }
    this.map.getView().animate({
      center: fromLonLat([location.longitude, location.latitude]),
      zoom: zoom ?? this.map.getView().getZoom(),
      duration: 450,
    });
    return true;
  }

  removeFromMap(): void {
    if (this.resolutionListener) {
      unByKey(this.resolutionListener);
      this.resolutionListener = null;
    }
    if (this.map && this.layer) {
      this.map.removeLayer(this.layer);
    }
    this.source?.clear();
    this.layer = null;
    this.source = null;
    this.map = null;
  }

  private render(location: PublicMapUserLocation, heading: number | null): void {
    if (!this.source) {
      return;
    }
    const coordinate = fromLonLat([location.longitude, location.latitude]);
    this.upsertAccuracy(location);
    this.upsertDirection(coordinate, heading);
    this.upsertDot(coordinate);
  }

  private upsertAccuracy(location: PublicMapUserLocation): void {
    if (!this.source || !Number.isFinite(location.accuracy) || location.accuracy <= 0) {
      return;
    }
    const geometry = circular([location.longitude, location.latitude], location.accuracy, 48);
    geometry.transform('EPSG:4326', 'EPSG:3857');
    let feature = this.source.getFeatureById('public-user-location-accuracy') as Feature | null;
    if (!feature) {
      feature = new Feature();
      feature.setId('public-user-location-accuracy');
      feature.setStyle(this.accuracyStyle());
      this.source.addFeature(feature);
    }
    feature.setGeometry(geometry);
    this.updateAccuracyVisibility();
  }

  private upsertDirection(coordinate: number[], heading: number | null): void {
    if (!this.source) {
      return;
    }
    const id = 'public-user-location-direction';
    let feature = this.source.getFeatureById(id) as Feature<Point> | null;
    if (heading === null || !Number.isFinite(heading)) {
      if (feature) {
        this.source.removeFeature(feature);
      }
      return;
    }
    if (!feature) {
      feature = new Feature(new Point(coordinate));
      feature.setId(id);
      this.source.addFeature(feature);
    } else {
      feature.getGeometry()?.setCoordinates(coordinate);
    }
    feature.setStyle(
      new Style({
        image: new Icon({
          src: this.directionConeDataUrl(),
          rotation: (heading * Math.PI) / 180,
          rotateWithView: false,
          anchor: [0.5, 0.5],
        }),
      }),
    );
  }

  private upsertDot(coordinate: number[]): void {
    if (!this.source) {
      return;
    }
    const id = 'public-user-location-dot';
    let feature = this.source.getFeatureById(id) as Feature<Point> | null;
    if (!feature) {
      feature = new Feature(new Point(coordinate));
      feature.setId(id);
      feature.setStyle(
        new Style({
          image: new Circle({
            radius: 8,
            fill: new Fill({ color: LOCATION_BLUE }),
            stroke: new Stroke({ color: '#ffffff', width: 3 }),
          }),
        }),
      );
      this.source.addFeature(feature);
    } else {
      feature.getGeometry()?.setCoordinates(coordinate);
    }
  }

  private updateAccuracyVisibility(): void {
    const feature = this.source?.getFeatureById('public-user-location-accuracy') as Feature | null;
    if (!feature || !this.map) {
      return;
    }
    feature.setStyle(
      (this.map.getView().getZoom() ?? 0) >= MIN_ACCURACY_CIRCLE_ZOOM ? this.accuracyStyle() : HIDDEN_STYLE,
    );
  }

  private accuracyStyle(): Style {
    return new Style({
      fill: new Fill({ color: 'rgba(11, 87, 208, 0.14)' }),
      stroke: new Stroke({ color: 'rgba(11, 87, 208, 0.35)', width: 1 }),
    });
  }

  private directionConeDataUrl(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path d="M32 31 15 4a32 32 0 0 1 34 0Z" fill="rgba(11,87,208,.38)"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  destroy(): void {
    this.hide();
    this.removeFromMap();
  }
}
