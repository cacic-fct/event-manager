import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Permission } from '@cacic-fct/shared-permissions';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { WorkspacePlacePresetsService } from '../../../shared/services/workspace-place-presets.service';

@Component({
  selector: 'app-workspace-places-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatTooltipModule,
  ],
  templateUrl: './workspace-places-tab.component.html',
  styleUrl: './workspace-places-tab.component.scss',
})
export class WorkspacePlacesTabComponent implements OnDestroy {
  readonly workspace = inject(WorkspacePlacePresetsService);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  protected readonly permissions = inject(WorkspacePermissionsService);
  protected readonly Permission = Permission;
  private readonly mapTarget = viewChild<ElementRef<HTMLDivElement>>('mapTarget');
  private readonly markerIconUrl = new URL('assets/shared/pin.svg', this.document.baseURI).toString();

  private map: { setTarget(target: HTMLElement | undefined): void; updateSize(): void } | null = null;
  private hasRendered = false;
  private renderVersion = 0;

  constructor() {
    void this.workspace.loadPlacePresets();
    afterNextRender(() => {
      this.hasRendered = true;
      void this.renderMap();
    });

    this.workspace.placeForm.controls.latitude.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.hasRendered) {
        void this.renderMap();
      }
    });
    this.workspace.placeForm.controls.longitude.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.hasRendered) {
        void this.renderMap();
      }
    });

    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const placeId = params.get('placeId');
      if (placeId) {
        void this.workspace.pickPlacePresetById(placeId);
        return;
      }

      if (this.workspace.selectedPlacePreset()) {
        this.workspace.startNewPlacePreset();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyMap();
  }

  protected hasLocation(): boolean {
    return this.location() !== null;
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

    const center = fromLonLat([location.longitude, location.latitude]);
    const marker = new Feature({
      geometry: new Point(center),
      name: this.workspace.placeForm.controls.name.value,
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

    requestAnimationFrame(() => this.map?.updateSize());
  }

  private location(): { latitude: number; longitude: number } | null {
    const latitude = Number(this.workspace.placeForm.controls.latitude.value);
    const longitude = Number(this.workspace.placeForm.controls.longitude.value);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return { latitude, longitude };
  }

  private destroyMap(): void {
    if (!this.map) {
      return;
    }

    this.map.setTarget(undefined);
    this.map = null;
  }
}
