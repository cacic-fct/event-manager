import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, MAX_MAP_ZOOM } from '@cacic-fct/shared-utils';

export type LocationCoordinates = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type LocationCoordinatePickerDialogData = Readonly<{
  coordinates?: LocationCoordinates | null;
}>;

type MapInstance = {
  setTarget(target: HTMLElement | undefined): void;
  updateSize(): void;
};

type NominatimSearchResult = Readonly<{
  lat: string;
  lon: string;
}>;

@Component({
  selector: 'app-location-coordinate-picker-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Selecionar localização no mapa</h2>
    <mat-dialog-content>
      <form class="search-bar" (submit)="search()">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Buscar endereço</mat-label>
          <input matInput [formControl]="searchControl" autocomplete="street-address" />
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="searching() || !searchControl.value.trim()">
          <mat-icon>search</mat-icon>
          Buscar
        </button>
      </form>
      @if (searchError()) {
        <p class="search-error" role="alert">{{ searchError() }}</p>
      }
      <div #mapTarget class="map" aria-label="Mapa para selecionar a localização"></div>
      @if (selectedCoordinates(); as coordinates) {
        <p class="coordinates" aria-live="polite">
          Ponto selecionado: {{ coordinates.latitude.toFixed(6) }}, {{ coordinates.longitude.toFixed(6) }}
        </p>
      } @else {
        <p class="coordinates">Clique ou toque no mapa para posicionar o marcador.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancel()">Cancelar</button>
      <button mat-flat-button type="button" [disabled]="!selectedCoordinates()" (click)="confirm()">Confirmar</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content { display: grid; gap: 12px; min-width: min(680px, calc(100vw - 48px)); }
    .search-bar { display: flex; gap: 8px; align-items: center; }
    .search-bar mat-form-field { flex: 1; }
    .map { height: min(56vh, 480px); min-height: 320px; border-radius: 8px; overflow: hidden; background: color-mix(in srgb, currentColor 8%, transparent); }
    .coordinates, .search-error { margin: 0; color: var(--mat-sys-on-surface-variant); }
    .search-error { color: var(--mat-sys-error); }
    @media (max-width: 599px) { mat-dialog-content { min-width: 0; } .search-bar { align-items: stretch; flex-direction: column; } .map { min-height: 280px; } }
  `,
})
export class LocationCoordinatePickerDialogComponent implements OnDestroy {
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly selectedCoordinates = signal<LocationCoordinates | null>(inject(MAT_DIALOG_DATA).coordinates ?? null);
  readonly searching = signal(false);
  readonly searchError = signal<string | null>(null);

  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly dialogRef = inject<MatDialogRef<LocationCoordinatePickerDialogComponent, LocationCoordinates>>(MatDialogRef);
  private readonly mapTarget = viewChild<ElementRef<HTMLDivElement>>('mapTarget');
  private readonly markerIconUrl = this.isBrowser
    ? new URL('assets/shared/pin.svg', this.document.baseURI).toString()
    : '';
  private map: MapInstance | null = null;
  private setMarker: ((coordinates: LocationCoordinates | null) => void) | null = null;

  constructor() {
    afterNextRender(() => void this.initializeMap());
  }

  ngOnDestroy(): void {
    this.map?.setTarget(undefined);
  }

  async search(): Promise<void> {
    const query = this.searchControl.value.trim();
    if (!query || this.searching()) {
      return;
    }

    this.searching.set(true);
    this.searchError.set(null);
    try {
      const parameters = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', 'accept-language': 'pt-BR' });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${parameters}`);
      if (!response.ok) {
        throw new Error('search-failed');
      }

      const [result] = (await response.json()) as NominatimSearchResult[];
      const latitude = Number(result?.lat);
      const longitude = Number(result?.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        this.searchError.set('Nenhum endereço foi encontrado. Tente uma busca mais específica.');
        return;
      }

      this.setSelectedCoordinates({ latitude, longitude }, true);
    } catch {
      this.searchError.set('Não foi possível buscar o endereço agora. Tente novamente.');
    } finally {
      this.searching.set(false);
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    const coordinates = this.selectedCoordinates();
    if (coordinates) {
      this.dialogRef.close(coordinates);
    }
  }

  private async initializeMap(): Promise<void> {
    const target = this.mapTarget()?.nativeElement;
    if (!target || !this.isBrowser) {
      return;
    }

    const [
      { default: Feature },
      { default: Map },
      { default: View },
      { default: Point },
      { Tile: TileLayer, Vector: VectorLayer },
      { fromLonLat, toLonLat },
      { default: OSM },
      { default: VectorSource },
      { Icon, Style },
    ] = await Promise.all([
      import('ol/Feature'), import('ol/Map'), import('ol/View'), import('ol/geom/Point'), import('ol/layer'),
      import('ol/proj'), import('ol/source/OSM'), import('ol/source/Vector'), import('ol/style'),
    ]);

    const markerSource = new VectorSource();
    const updateMarker = (coordinates: LocationCoordinates | null) => {
      markerSource.clear();
      if (!coordinates) return;
      const marker = new Feature({ geometry: new Point(fromLonLat([coordinates.longitude, coordinates.latitude])) });
      marker.setStyle(new Style({ image: new Icon({ anchor: [400, 700], anchorXUnits: 'pixels', anchorYUnits: 'pixels', src: this.markerIconUrl, scale: 0.065 }) }));
      markerSource.addFeature(marker);
    };
    this.setMarker = updateMarker;
    updateMarker(this.selectedCoordinates());

    const view = new View({
      center: fromLonLat(DEFAULT_MAP_CENTER),
      zoom: DEFAULT_MAP_ZOOM,
      maxZoom: MAX_MAP_ZOOM,
    });
    const map = new Map({
      target,
      layers: [new TileLayer({ source: new OSM() }), new VectorLayer({ source: markerSource })],
      view,
    });
    map.on('singleclick', (event) => {
      const [longitude, latitude] = toLonLat(event.coordinate);
      this.setSelectedCoordinates({ latitude, longitude });
    });
    this.map = map;
    requestAnimationFrame(() => map.updateSize());
  }

  private setSelectedCoordinates(coordinates: LocationCoordinates, centerMap = false): void {
    this.selectedCoordinates.set(coordinates);
    this.setMarker?.(coordinates);
    if (centerMap) {
      void import('ol/proj').then(({ fromLonLat }) => {
        const map = this.map as (MapInstance & { getView(): { animate(options: { center: number[]; zoom: number }): void } }) | null;
        map?.getView().animate({
          center: fromLonLat([coordinates.longitude, coordinates.latitude]),
          zoom: DEFAULT_MAP_ZOOM,
        });
      });
    }
  }
}
