import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import type { PublicMapEvent } from '@cacic-fct/event-manager-public-contracts';
import { AuthService } from '@cacic-fct/shared-angular';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  MAX_MAP_ZOOM,
  OPENSTREETMAP_TILE_REFERRER_POLICY,
} from '@cacic-fct/shared-utils';
import type Feature from 'ol/Feature';
import type OlMap from 'ol/Map';
import type Point from 'ol/geom/Point';
import type ClusterSource from 'ol/source/Cluster';
import type VectorSource from 'ol/source/Vector';
import type { EventsKey } from 'ol/events';
import type { Coordinate } from 'ol/coordinate';
import { catchError, forkJoin, of } from 'rxjs';
import { EmojiService } from '../shared/emoji.service';
import { PublicMapGeolocationService } from '../shared/map/public-map-geolocation.service';
import { PublicUserLocationLayerService } from '../shared/map/public-user-location-layer.service';
import { PublicMapTileCacheWarmupService } from '../shared/map/public-map-tile-cache-warmup.service';
import { NetworkStatusService } from '../shared/network-status.service';
import { PublicMapApiService } from './public-map-api.service';
import {
  PublicMapFilterDialog,
  PublicMapFilterDialogData,
} from './public-map-filter-dialog';
import { DEFAULT_PUBLIC_MAP_FILTERS, PublicMapFilters } from './public-map.models';
import { PublicMapStateService } from './public-map-state.service';
import {
  PUBLIC_MAP_EVENT_QUERY_PARAM,
  averageCoordinates,
  filterPublicMapEvents,
} from './public-map.utils';

type MapState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

const CLUSTER_DISTANCE_PX = 44;
const CLUSTER_MIN_DISTANCE_PX = 28;
const FIT_PADDING_PX = 72;

@Component({
  selector: 'app-public-map-page',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
  templateUrl: './public-map-page.html',
  styleUrl: './public-map-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicMapPage implements AfterViewInit {
  private readonly api = inject(PublicMapApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly document = inject(DOCUMENT);
  private readonly emoji = inject(EmojiService);
  private readonly geolocation = inject(PublicMapGeolocationService);
  private readonly locationLayer = inject(PublicUserLocationLayerService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly tileCacheWarmup = inject(PublicMapTileCacheWarmupService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly stateStorage = inject(PublicMapStateService);
  private readonly mapTarget = viewChild<ElementRef<HTMLDivElement>>('mapTarget');

  readonly state = signal<MapState>({ status: 'loading' });
  readonly isUsingSavedData = this.api.isUsingSavedData;
  readonly events = signal<PublicMapEvent[]>([]);
  readonly currentUserEventIds = signal<ReadonlySet<string>>(new Set());
  readonly filters = signal(this.initialFilters());
  readonly utilityMenuOpen = signal(false);
  readonly utilityMenuMounted = signal(false);
  readonly mapInteractionReady = signal(false);
  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly locationPermission = this.geolocation.permission;
  readonly isLocating = this.geolocation.isRequesting;
  readonly isOffline = computed(() => !this.networkStatus.isOnline());
  readonly filteredEvents = computed(() =>
    filterPublicMapEvents(this.events(), this.filters(), this.currentUserEventIds()),
  );
  readonly filterCount = computed(() => {
    const value = this.filters();
    return Number(value.audience !== 'ALL') + Number(value.date !== 'ALL');
  });
  readonly locationIcon = computed(() =>
    this.locationPermission() === 'denied' || this.locationPermission() === 'unsupported'
      ? 'location_disabled'
      : 'near_me',
  );

  private map: OlMap | null = null;
  private eventSource: VectorSource<Feature<Point>> | null = null;
  private clusterSource: ClusterSource<Feature<Point>> | null = null;
  private spreadSource: VectorSource<Feature<Point>> | null = null;
  private deepLinkSource: VectorSource<Feature<Point>> | null = null;
  private projectCoordinate: ((coordinate: Coordinate) => Coordinate) | null = null;
  private mapEventKeys: EventsKey[] = [];
  private readonly eventIconImages = new globalThis.Map<string, HTMLCanvasElement>();
  private readonly restoredState = this.stateStorage.read();
  private readonly deepLinkedEventId = this.route.snapshot.queryParamMap.get(PUBLIC_MAP_EVENT_QUERY_PARAM);
  private hasAppliedInitialView = false;
  private utilityMenuShowPending = false;
  private utilityMenuAnimationFrame: number | null = null;
  private mapRenderRevision = 0;
  private lastMapNotice: string | null = null;

  private readonly mapNotice = effect(() => {
    const notice = this.getMapNotice();
    if (notice === this.lastMapNotice) {
      return;
    }

    this.lastMapNotice = notice;
    if (notice) {
      this.showSnackBar(notice, 6000);
    }
  });

  private readonly dataLoader = effect((onCleanup) => {
    const authenticated = this.auth.isAuthenticated();
    const userId = this.auth.user()?.sub;
    if (!authenticated && this.filters().audience === 'MINE') {
      this.filters.update((filters) => ({ ...filters, audience: 'ALL' }));
    }

    this.state.set({ status: 'loading' });
    const request = forkJoin({
      events: this.api.getEvents(),
      currentUserEventIds:
        authenticated && userId
          ? this.api.getCurrentUserEventIds(userId).pipe(
              catchError(() => {
                this.showSnackBar('Não foi possível carregar seus eventos. Mostrando todos os eventos.', 5000);
                this.filters.update((filters) => ({ ...filters, audience: 'ALL' }));
                this.updateFilterQueryParams();
                return of(new Set<string>());
              }),
            )
          : of(new Set<string>()),
    }).subscribe({
      next: ({ events, currentUserEventIds }) => {
        this.events.set(events);
        this.currentUserEventIds.set(currentUserEventIds);
        this.state.set({ status: 'ready' });
        this.renderEvents(!this.hasAppliedInitialView);
      },
      error: () => this.state.set({
        status: 'error',
        message: 'Não foi possível carregar o mapa de eventos. Tente novamente em instantes.',
      }),
    });
    onCleanup(() => request.unsubscribe());
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const onVisibilityChange = () => {
        if (this.document.visibilityState === 'hidden') {
          this.locationLayer.stopAndHide();
        }
      };
      this.document.addEventListener('visibilitychange', onVisibilityChange);
      this.destroyRef.onDestroy(() => this.document.removeEventListener('visibilitychange', onVisibilityChange));
    }

    this.destroyRef.onDestroy(() => {
      this.cancelUtilityMenuShow();
      void this.destroyMap();
    });
  }

  ngAfterViewInit(): void {
    const target = this.mapTarget()?.nativeElement;
    if (target && isPlatformBrowser(this.platformId)) {
      void this.initializeMap();
    }
  }

  goBack(): void {
    void this.router.navigateByUrl('/menu');
  }

  showOfflineInfo(): void {
    this.showSnackBar('Você está off-line. Os dados exibidos no mapa podem estar desatualizados.', 5000);
  }

  toggleUtilityMenu(): void {
    if (this.utilityMenuOpen()) {
      this.cancelUtilityMenuShow();
      this.utilityMenuOpen.set(false);
      return;
    }
    if (this.utilityMenuShowPending) {
      this.cancelUtilityMenuShow();
      this.utilityMenuMounted.set(false);
      return;
    }
    if (this.utilityMenuMounted()) {
      this.utilityMenuOpen.set(true);
      return;
    }

    this.utilityMenuMounted.set(true);
    this.utilityMenuShowPending = true;
    const show = () => {
      this.utilityMenuAnimationFrame = null;
      if (!this.utilityMenuShowPending) {
        return;
      }
      this.utilityMenuShowPending = false;
      this.utilityMenuOpen.set(true);
    };
    if (typeof requestAnimationFrame === 'function') {
      this.utilityMenuAnimationFrame = requestAnimationFrame(show);
    } else {
      void Promise.resolve().then(show);
    }
  }

  closeUtilityMenu(): void {
    this.cancelUtilityMenuShow();
    this.utilityMenuOpen.set(false);
  }

  onUtilityMenuTransitionEnd(event: TransitionEvent): void {
    if (event.propertyName === 'opacity' && !this.utilityMenuOpen() && !this.utilityMenuShowPending) {
      this.utilityMenuMounted.set(false);
    }
  }

  zoomBy(delta: number): void {
    const view = this.map?.getView();
    const zoom = view?.getZoom();
    if (view && zoom != null) {
      view.animate({ zoom: Math.max(1, Math.min(MAX_MAP_ZOOM, zoom + delta)), duration: 180 });
    }
  }

  centerEvents(): void {
    this.fitVisibleEvents(true);
    this.closeUtilityMenu();
  }

  openFilters(): void {
    this.closeUtilityMenu();
    const data: PublicMapFilterDialogData = {
      filters: this.filters(),
      isAuthenticated: this.isAuthenticated(),
    };
    this.dialog
      .open<PublicMapFilterDialog, PublicMapFilterDialogData, PublicMapFilters>(PublicMapFilterDialog, { data })
      .afterClosed()
      .subscribe((filters) => {
        if (!filters) {
          return;
        }
        this.filters.set(filters);
        this.updateFilterQueryParams();
        this.renderEvents(true);
      });
  }

  async locate(): Promise<void> {
    this.closeUtilityMenu();
    const permission = this.locationPermission();
    if (permission === 'denied') {
      this.showSnackBar('A localização está bloqueada. Libere a permissão nas configurações do navegador.', 6000);
      return;
    }
    if (permission === 'unsupported') {
      this.showSnackBar('Este navegador não oferece localização para o mapa.', 5000);
      return;
    }
    if (!this.map) {
      return;
    }

    const result = await this.locationLayer.startAndCenter(this.map, DEFAULT_MAP_ZOOM);
    if (!result.success) {
      this.showSnackBar(result.error, 6000);
    }
  }

  openEventFromList(event: PublicMapEvent): void {
    this.openEvent(event);
  }

  private initialFilters(): PublicMapFilters {
    const stored = this.stateStorage.read()?.filters ?? DEFAULT_PUBLIC_MAP_FILTERS;
    return {
      audience: this.route.snapshot.queryParamMap.get('participacao') === 'meus' ? 'MINE' : stored.audience,
      date: this.route.snapshot.queryParamMap.get('periodo') === 'hoje' ? 'TODAY' : stored.date,
    };
  }

  private getMapNotice(): string | null {
    if (this.state().status !== 'ready') {
      return null;
    }

    const emptyMessage = this.filterCount()
      ? 'Nenhum evento corresponde aos filtros.'
      : 'Nenhum evento com localização disponível.';
    const isEmpty = this.filteredEvents().length === 0;

    if (this.isUsingSavedData()) {
      const savedDataMessage = this.isOffline()
        ? 'Você está off-line. Os dados exibidos no mapa podem estar desatualizados.'
        : 'Não foi possível atualizar o mapa. Os dados exibidos podem estar desatualizados.';
      return isEmpty ? `${savedDataMessage} ${emptyMessage}` : savedDataMessage;
    }

    return isEmpty ? emptyMessage : null;
  }

  private showSnackBar(message: string, duration: number): void {
    // A map state can change while another map action is reporting feedback.
    // Replacing the current snackbar keeps the map viewport unobstructed.
    this.snackBar.dismiss();
    this.snackBar.open(message, 'Fechar', {
      duration,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }

  private cancelUtilityMenuShow(): void {
    this.utilityMenuShowPending = false;
    if (this.utilityMenuAnimationFrame !== null) {
      cancelAnimationFrame(this.utilityMenuAnimationFrame);
      this.utilityMenuAnimationFrame = null;
    }
  }

  private async initializeMap(): Promise<void> {
    const [
      { default: OlMap },
      { default: View },
      { default: TileLayer },
      { default: OlVectorLayer },
      { fromLonLat },
      { default: OSM },
      { default: OlClusterSource },
      { default: OlVectorSource },
      { Circle: CircleStyle, Fill, Icon, Stroke, Style, Text },
    ] = await Promise.all([
      import('ol/Map'),
      import('ol/View'),
      import('ol/layer/Tile'),
      import('ol/layer/Vector'),
      import('ol/proj'),
      import('ol/source/OSM'),
      import('ol/source/Cluster'),
      import('ol/source/Vector'),
      import('ol/style'),
    ]);
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    const target = this.mapTarget()?.nativeElement;
    if (this.destroyRef.destroyed || !target?.isConnected) {
      return;
    }

    const eventSource = new OlVectorSource<Feature<Point>>({ wrapX: false });
    const clusterSource = new OlClusterSource<Feature<Point>>({
      source: eventSource,
      distance: CLUSTER_DISTANCE_PX,
      minDistance: CLUSTER_MIN_DISTANCE_PX,
    });
    const spreadSource = new OlVectorSource<Feature<Point>>({ wrapX: false });
    const deepLinkSource = new OlVectorSource<Feature<Point>>({ wrapX: false });
    const eventStyleCache = new globalThis.Map<string, InstanceType<typeof Style>[]>();
    const clusterStyleCache = new globalThis.Map<number, InstanceType<typeof Style>>();
    const resolveThemeColor = (property: string, fallback: string): string => {
      const probe = this.document.createElement('span');
      probe.hidden = true;
      probe.style.color = `var(${property}, ${fallback})`;
      target.appendChild(probe);
      const resolved = this.document.defaultView?.getComputedStyle(probe).color || fallback;
      probe.remove();
      return resolved;
    };
    const primaryColor = resolveThemeColor('--mat-sys-primary', '#0b57d0');
    const surfaceColor = resolveThemeColor('--mat-sys-surface', '#ffffff');

    const eventStyles = (event: PublicMapEvent) => {
      const isDeepLinked = event.id === this.deepLinkedEventId;
      const cacheKey = `${event.emoji}:${isDeepLinked}`;
      const cached = eventStyleCache.get(cacheKey);
      if (cached) {
        return cached;
      }
      const image = this.eventIconImages.get(event.emoji);
      const styles = [
        new Style({
          zIndex: 0,
          image: new CircleStyle({
            radius: isDeepLinked ? 23 : 20,
            fill: new Fill({ color: surfaceColor }),
            stroke: new Stroke({ color: primaryColor, width: isDeepLinked ? 4 : 2 }),
          }),
        }),
        new Style({
          zIndex: 1,
          image: image ? new Icon({ img: image, width: 29, height: 29 }) : undefined,
          text: image ? undefined : new Text({ text: event.emoji, font: '26px sans-serif' }),
        }),
      ];
      if (image) {
        eventStyleCache.set(cacheKey, styles);
      }
      return styles;
    };

    const clusterLayer = new OlVectorLayer({
      source: clusterSource,
      zIndex: 20,
      style: (feature) => {
        const members = (feature.get('features') as Feature<Point>[] | undefined) ?? [];
        if (members.length === 1) {
          const event = members[0].get('mapEvent') as PublicMapEvent | undefined;
          return event ? eventStyles(event) : undefined;
        }
        if (members.length === 0) {
          return undefined;
        }
        const cached = clusterStyleCache.get(members.length);
        if (cached) {
          return cached;
        }
        const radius = members.length < 10 ? 16 : members.length < 100 ? 19 : 23;
        const style = new Style({
          image: new CircleStyle({
            radius,
            fill: new Fill({ color: '#0b57d0' }),
            stroke: new Stroke({ color: '#ffffff', width: 3 }),
          }),
          text: new Text({
            text: members.length.toLocaleString('pt-BR'),
            fill: new Fill({ color: '#ffffff' }),
            font: '600 13px Inter, sans-serif',
          }),
        });
        clusterStyleCache.set(members.length, style);
        return style;
      },
    });
    const spreadLayer = new OlVectorLayer({
      source: spreadSource,
      zIndex: 30,
      style: (feature) => {
        const event = feature.get('mapEvent') as PublicMapEvent | undefined;
        return event ? eventStyles(event) : undefined;
      },
    });
    const deepLinkLayer = new OlVectorLayer({
      source: deepLinkSource,
      zIndex: 31,
      style: (feature) => {
        const event = feature.get('mapEvent') as PublicMapEvent | undefined;
        return event ? eventStyles(event) : undefined;
      },
    });

    const stored = this.restoredState;
    const view = new View({
      center: fromLonLat(stored?.center ?? [...DEFAULT_MAP_CENTER]),
      zoom: stored?.zoom ?? DEFAULT_MAP_ZOOM,
      rotation: stored?.rotation ?? 0,
      maxZoom: MAX_MAP_ZOOM,
    });
    const map = new OlMap({
      target,
      controls: [],
      layers: [
        new TileLayer({ source: new OSM({ referrerPolicy: OPENSTREETMAP_TILE_REFERRER_POLICY }) }),
        clusterLayer,
        spreadLayer,
        deepLinkLayer,
      ],
      view,
    });
    Object.assign(globalThis, { __eventMap: map });

    this.map = map;
    this.eventSource = eventSource;
    this.clusterSource = clusterSource;
    this.spreadSource = spreadSource;
    this.deepLinkSource = deepLinkSource;
    this.projectCoordinate = fromLonLat;
    this.locationLayer.addToMap(map);

    const clickKey = map.on('singleclick', (mapEvent) => this.handleMapClick(mapEvent.pixel));
    const moveKey = map.on('movestart', () => spreadSource.clear());
    const moveEndKey = map.on('moveend', () => this.saveMapState());
    const pointerKey = map.on('pointermove', (mapEvent) => {
      target.style.cursor = map.hasFeatureAtPixel(mapEvent.pixel) ? 'pointer' : '';
    });
    this.mapEventKeys = [clickKey, moveKey, moveEndKey, pointerKey];

    await this.renderEvents(!stored);
    requestAnimationFrame(() => map.updateSize());
    setTimeout(() => {
      if (this.map === map) {
        map.updateSize();
        map.render();
      }
    }, 250);

  }

  private async renderEvents(fit: boolean): Promise<void> {
    const renderRevision = ++this.mapRenderRevision;
    this.mapInteractionReady.set(false);
    const source = this.eventSource;
    if (!source) {
      return;
    }
    const events = this.filteredEvents();
    this.preloadEventIcons(events);
    const [{ default: FeatureClass }, { default: PointClass }, { fromLonLat }] = await Promise.all([
      import('ol/Feature'),
      import('ol/geom/Point'),
      import('ol/proj'),
    ]);
    if (source !== this.eventSource) {
      return;
    }

    const seen = new Set<string>();
    const features = events.flatMap((event) => {
      if (seen.has(event.id) || event.longitude == null || event.latitude == null) {
        return [];
      }
      seen.add(event.id);
      const feature = new FeatureClass({
        geometry: new PointClass(fromLonLat([event.longitude, event.latitude])),
      }) as Feature<Point>;
      feature.set('mapEvent', event);
      feature.setId(event.id);
      return [feature];
    });
    this.spreadSource?.clear();
    this.deepLinkSource?.clear();
    source.clear();
    const deepLinkedEvent = events.find((event) => event.id === this.deepLinkedEventId);
    const deepLinkedFeature = deepLinkedEvent
      ? features.find((feature) => feature.getId() === deepLinkedEvent.id)
      : undefined;
    source.addFeatures(features.filter((feature) => feature !== deepLinkedFeature));
    if (deepLinkedFeature) {
      this.deepLinkSource?.addFeature(deepLinkedFeature);
    }
    if (fit && deepLinkedEvent) {
      this.focusEvent(deepLinkedEvent, false);
    } else if (fit) {
      this.fitVisibleEvents(false);
    }
    this.hasAppliedInitialView = true;
    if (renderRevision === this.mapRenderRevision && this.map) {
      this.map.render();
      this.mapInteractionReady.set(true);
    }
  }

  private preloadEventIcons(events: readonly PublicMapEvent[]): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const emojis = [...new Set(events.map((event) => event.emoji))];
    emojis.forEach((emoji) => {
      if (this.eventIconImages.has(emoji)) {
        return;
      }
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = this.emoji.getTwemojiUrl(emoji);
      void image
        .decode()
        .then(() => {
          if (this.destroyRef.destroyed) {
            return;
          }
          const canvas = this.document.createElement('canvas');
          canvas.width = 36;
          canvas.height = 36;
          canvas.getContext('2d')?.drawImage(image, 0, 0, 36, 36);
          this.eventIconImages.set(emoji, canvas);
          this.map?.render();
        })
        .catch(() => {
          // The style keeps using the platform emoji when Twemoji cannot load.
        });
    });
  }

  private focusEvent(event: PublicMapEvent, animate: boolean): void {
    if (!this.map || !this.projectCoordinate || event.longitude == null || event.latitude == null) {
      return;
    }
    this.map.getView().animate({
      center: this.projectCoordinate([event.longitude, event.latitude]),
      zoom: DEFAULT_MAP_ZOOM,
      duration: animate ? 260 : 0,
    });
  }

  private fitVisibleEvents(animate: boolean): void {
    const map = this.map;
    const projectCoordinate = this.projectCoordinate;
    const events = this.filteredEvents();
    const average = averageCoordinates(events);
    if (!map || !projectCoordinate || !average) {
      if (map) {
        map.getView().animate({
          center: projectCoordinate?.([...DEFAULT_MAP_CENTER]) ?? map.getView().getCenter(),
          zoom: DEFAULT_MAP_ZOOM,
          duration: animate ? 260 : 0,
        });
      }
      return;
    }

    const projectedCenter = projectCoordinate(average);
    const projected = events.flatMap((event) =>
      event.longitude == null || event.latitude == null
        ? []
        : [projectCoordinate([event.longitude, event.latitude])],
    );
    const maximumDelta = projected.reduce(
      (delta, coordinate) => [
        Math.max(delta[0], Math.abs(coordinate[0] - projectedCenter[0])),
        Math.max(delta[1], Math.abs(coordinate[1] - projectedCenter[1])),
      ],
      [0, 0],
    );
    const view = map.getView();
    if (projected.length === 1 || (maximumDelta[0] === 0 && maximumDelta[1] === 0)) {
      view.animate({ center: projectedCenter, zoom: DEFAULT_MAP_ZOOM, duration: animate ? 260 : 0 });
      return;
    }
    view.fit(
      [
        projectedCenter[0] - maximumDelta[0],
        projectedCenter[1] - maximumDelta[1],
        projectedCenter[0] + maximumDelta[0],
        projectedCenter[1] + maximumDelta[1],
      ],
      { padding: [FIT_PADDING_PX, FIT_PADDING_PX, FIT_PADDING_PX, FIT_PADDING_PX], maxZoom: DEFAULT_MAP_ZOOM, duration: animate ? 260 : 0 },
    );
  }

  private handleMapClick(pixel: number[]): void {
    const map = this.map;
    if (!map) {
      return;
    }
    const feature = map.forEachFeatureAtPixel(pixel, (candidate) => candidate as Feature<Point>);
    if (!feature) {
      return;
    }
    const directEvent = feature.get('mapEvent') as PublicMapEvent | undefined;
    if (directEvent) {
      this.openEvent(directEvent);
      return;
    }
    const members = (feature.get('features') as Feature<Point>[] | undefined) ?? [];
    if (members.length === 1) {
      const event = members[0].get('mapEvent') as PublicMapEvent | undefined;
      if (event) {
        this.openEvent(event);
      }
      return;
    }
    if (members.length < 2) {
      return;
    }
    const zoom = map.getView().getZoom() ?? DEFAULT_MAP_ZOOM;
    if (zoom < MAX_MAP_ZOOM) {
      const geometry = feature.getGeometry();
      map.getView().animate({ center: geometry?.getCoordinates(), zoom: Math.min(MAX_MAP_ZOOM, zoom + 2), duration: 260 });
      return;
    }
    this.spreadCluster(members, pixel);
  }

  private async spreadCluster(members: Feature<Point>[], centerPixel: number[]): Promise<void> {
    const map = this.map;
    const spreadSource = this.spreadSource;
    if (!map || !spreadSource) {
      return;
    }
    const [{ default: FeatureClass }, { default: PointClass }] = await Promise.all([
      import('ol/Feature'),
      import('ol/geom/Point'),
    ]);
    spreadSource.clear();
    const count = members.length;
    members.forEach((member, index) => {
      const ring = Math.floor(index / 8);
      const ringStart = ring === 0 ? 0 : 8 + ((ring - 1) * ring * 12) / 2;
      const ringCapacity = ring === 0 ? Math.min(8, count) : Math.min(ring * 12, count - ringStart);
      const ringIndex = index - ringStart;
      const radius = 42 + ring * 30;
      const angle = (Math.PI * 2 * ringIndex) / Math.max(1, ringCapacity) + (ring % 2 ? Math.PI / ringCapacity : 0);
      const coordinate = map.getCoordinateFromPixel([
        centerPixel[0] + Math.cos(angle) * radius,
        centerPixel[1] + Math.sin(angle) * radius,
      ]);
      const event = member.get('mapEvent') as PublicMapEvent | undefined;
      if (!event) {
        return;
      }
      const spreadFeature = new FeatureClass({ geometry: new PointClass(coordinate) }) as Feature<Point>;
      spreadFeature.set('mapEvent', event);
      spreadFeature.setId(`spread:${event.id}`);
      spreadSource.addFeature(spreadFeature);
    });
  }

  private openEvent(event: PublicMapEvent): void {
    this.saveMapState();
    void this.tileCacheWarmup.warmLocation(event.latitude, event.longitude);
    void this.router.navigate(['/event', event.id], {
      queryParams: { back: this.safeMapReturnUrl() },
    });
  }

  private safeMapReturnUrl(): string {
    const filters = this.filters();
    const parameters = new URLSearchParams();
    if (filters.audience === 'MINE') {
      parameters.set('participacao', 'meus');
    }
    if (filters.date === 'TODAY') {
      parameters.set('periodo', 'hoje');
    }
    if (this.deepLinkedEventId) {
      parameters.set(PUBLIC_MAP_EVENT_QUERY_PARAM, this.deepLinkedEventId);
    }
    const query = parameters.toString();
    return query ? `/map?${query}` : '/map';
  }

  private updateFilterQueryParams(): void {
    const filters = this.filters();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        participacao: filters.audience === 'MINE' ? 'meus' : null,
        periodo: filters.date === 'TODAY' ? 'hoje' : null,
        [PUBLIC_MAP_EVENT_QUERY_PARAM]: this.deepLinkedEventId,
      },
      replaceUrl: true,
    });
  }

  private async saveMapState(): Promise<void> {
    const map = this.map;
    const center = map?.getView().getCenter();
    const zoom = map?.getView().getZoom();
    if (!map || !center || zoom == null) {
      return;
    }
    const { toLonLat } = await import('ol/proj');
    const lonLat = toLonLat(center);
    this.stateStorage.write({
      center: [lonLat[0], lonLat[1]],
      zoom,
      rotation: map.getView().getRotation(),
      filters: this.filters(),
    });
  }

  private async destroyMap(): Promise<void> {
    this.locationLayer.destroy();
    this.mapInteractionReady.set(false);
    const map = this.map;
    if (!map) {
      return;
    }
    const { unByKey } = await import('ol/Observable');
    unByKey(this.mapEventKeys);
    this.mapEventKeys = [];
    this.clusterSource?.setSource(null);
    this.eventSource?.clear();
    this.spreadSource?.clear();
    this.deepLinkSource?.clear();
    map.setTarget(undefined);
    map.dispose();
    this.map = null;
    this.eventSource = null;
    this.clusterSource = null;
    this.spreadSource = null;
    this.deepLinkSource = null;
    this.projectCoordinate = null;
  }
}
