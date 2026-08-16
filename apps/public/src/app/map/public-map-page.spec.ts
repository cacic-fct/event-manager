import { PLATFORM_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import type { PublicMapEvent } from '@cacic-fct/event-manager-public-contracts';
import { AuthService } from '@cacic-fct/shared-angular';
import { Observable, Subject, of, throwError } from 'rxjs';
import { EmojiService } from '../shared/emoji.service';
import { PublicMapGeolocationService } from '../shared/map/public-map-geolocation.service';
import { PublicUserLocationLayerService } from '../shared/map/public-user-location-layer.service';
import { PublicMapTileCacheWarmupService } from '../shared/map/public-map-tile-cache-warmup.service';
import { PublicMapApiService } from './public-map-api.service';
import { PublicMapPage } from './public-map-page';
import { PublicMapStateService, StoredPublicMapState } from './public-map-state.service';

describe('PublicMapPage', () => {
  let fixture: ComponentFixture<PublicMapPage>;
  let api: {
    getEvents: ReturnType<typeof vi.fn>;
    getCurrentUserEventIds: ReturnType<typeof vi.fn>;
    isUsingSavedData: ReturnType<typeof signal<boolean>>;
  };
  let authenticated: ReturnType<typeof signal<boolean>>;
  let user: ReturnType<typeof signal<{ sub: string } | null>>;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn>; navigateByUrl: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };
  let permission: ReturnType<typeof signal<'prompt' | 'granted' | 'denied' | 'unsupported'>>;
  let locationLayer: {
    addToMap: ReturnType<typeof vi.fn>;
    startAndCenter: ReturnType<typeof vi.fn>;
    stopAndHide: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  let tileCacheWarmup: { warmLocation: ReturnType<typeof vi.fn> };
  let stateStorage: {
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
  };

  afterEach(() => TestBed.resetTestingModule());

  it('renders loading, ready empty, and API error states', async () => {
    const eventsRequest = new Subject<PublicMapEvent[]>();
    const component = await createPage({ eventsResponse: eventsRequest });

    expect(component.state()).toEqual({ status: 'loading' });
    expect(fixture.nativeElement.querySelector('[aria-label="Carregando eventos no mapa"]')).not.toBeNull();

    eventsRequest.next([]);
    eventsRequest.complete();
    await refresh();

    expect(component.state()).toEqual({ status: 'ready' });
    expect(fixture.nativeElement.textContent).toContain('Nenhum evento com localização disponível.');

    fixture.destroy();
    TestBed.resetTestingModule();
    const failed = await createPage({ eventsResponse: throwError(() => new Error('offline')) });
    await refresh();

    expect(failed.state()).toEqual({
      status: 'error',
      message: 'Não foi possível carregar o mapa de eventos. Tente novamente em instantes.',
    });
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível');
  });

  it('discloses when the map is using saved data that may be outdated', async () => {
    await createPage();
    api.isUsingSavedData.set(true);
    await refresh();

    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain(
      'Mapa salvo. As informações podem estar desatualizadas.',
    );
  });

  it('does not request private event ids for signed-out visitors and rejects a stale my-events URL filter', async () => {
    const component = await createPage({ query: { participacao: 'meus' }, isAuthenticated: false });
    await refresh();

    expect(api.getCurrentUserEventIds).not.toHaveBeenCalled();
    expect(component.filters().audience).toBe('ALL');
    expect(component.filteredEvents()).toHaveLength(2);
  });

  it('loads and applies my-event ids only for the authenticated user', async () => {
    const component = await createPage({
      query: { participacao: 'meus' },
      isAuthenticated: true,
      mineResponse: of(new Set(['event-2'])),
    });
    await refresh();

    expect(api.getCurrentUserEventIds).toHaveBeenCalledWith('user-1');
    expect(component.filteredEvents().map(({ id }) => id)).toEqual(['event-2']);
    expect(fixture.nativeElement.querySelector('[aria-label="Filtros ativos"]')?.textContent).toContain('1');
  });

  it('falls back to all events and clears the private URL filter when my-events loading fails', async () => {
    const component = await createPage({
      query: { participacao: 'meus' },
      isAuthenticated: true,
      mineResponse: throwError(() => new Error('forbidden')),
    });
    await refresh();

    expect(component.filters().audience).toBe('ALL');
    expect(component.filteredEvents()).toHaveLength(2);
    expect(snackBar.open).toHaveBeenCalledWith(
      'Não foi possível carregar seus eventos. Mostrando todos os eventos.',
      'OK',
      { duration: 5000 },
    );
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({ participacao: null }),
      replaceUrl: true,
    }));
  });

  it('opens the consistent filter dialog, persists its URL state, and exposes filtered empty copy', async () => {
    const component = await createPage({
      isAuthenticated: true,
      mineResponse: of(new Set<string>()),
      dialogResult: { audience: 'MINE', date: 'TODAY' },
    });
    await refresh();

    component.toggleUtilityMenu();
    component.openFilters();
    await refresh();

    expect(component.utilityMenuOpen()).toBe(false);
    expect(dialog.open).toHaveBeenCalledWith(expect.any(Function), {
      data: { filters: { audience: 'ALL', date: 'ALL' }, isAuthenticated: true },
    });
    expect(component.filters()).toEqual({ audience: 'MINE', date: 'TODAY' });
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { participacao: 'meus', periodo: 'hoje', evento: null },
      replaceUrl: true,
    }));
    expect(fixture.nativeElement.textContent).toContain('Nenhum evento corresponde aos filtros.');
    expect(fixture.nativeElement.textContent).toContain('Revisar filtros');
  });

  it('keeps filters unchanged when the dialog is dismissed', async () => {
    const component = await createPage({ dialogResult: undefined });

    component.openFilters();

    expect(component.filters()).toEqual({ audience: 'ALL', date: 'ALL' });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('opens and closes the utility FAB group with accessible state', async () => {
    const component = await createPage();
    await refresh();
    const toggle = () => fixture.nativeElement.querySelector('.menu-fab') as HTMLButtonElement;

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    component.toggleUtilityMenu();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await refresh();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-label')).toBe('Fechar utilitários do mapa');
  });

  it.each([
    ['denied', 'A localização está bloqueada. Libere a permissão nas configurações do navegador.', 6000],
    ['unsupported', 'Este navegador não oferece localização para o mapa.', 5000],
  ] as const)('does not start location tracking when permission is %s', async (status, message, duration) => {
    const component = await createPage({ permission: status });
    await refresh();

    await component.locate();
    await refresh();

    expect(locationLayer.startAndCenter).not.toHaveBeenCalled();
    expect(snackBar.open).toHaveBeenCalledWith(message, 'OK', { duration });
    expect(component.locationIcon()).toBe('location_disabled');
  });

  it('starts location only after the explicit action and reports layer errors', async () => {
    const component = await createPage({ locationResult: { success: false, error: 'Sinal indisponível.' } });
    const map = { getView: vi.fn() };
    setPrivateMap(component, map);

    expect(locationLayer.startAndCenter).not.toHaveBeenCalled();
    await component.locate();

    expect(locationLayer.startAndCenter).toHaveBeenCalledWith(expect.objectContaining(map), 18);
    expect(snackBar.open).toHaveBeenCalledWith('Sinal indisponível.', 'OK', { duration: 6000 });
  });

  it('clamps zoom controls and navigates back to the menu', async () => {
    const component = await createPage();
    const animate = vi.fn();
    const view = { getZoom: vi.fn(() => 19), animate };
    setPrivateMap(component, { getView: () => view });

    component.zoomBy(1);
    component.goBack();

    expect(animate).toHaveBeenCalledWith({ zoom: 19, duration: 180 });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/menu');
    const zoomButtons = fixture.nativeElement.querySelectorAll('.zoom-fab');
    expect(zoomButtons).toHaveLength(2);
    expect([...zoomButtons].every((button: Element) => !button.querySelector('.mat-ripple'))).toBe(true);
  });

  it('navigates to an event with a safe map return URL that preserves filters', async () => {
    const component = await createPage({
      query: { participacao: 'meus', periodo: 'hoje' },
      isAuthenticated: true,
      mineResponse: of(new Set(['event-1'])),
    });
    await refresh();

    component.openEventFromList(component.filteredEvents()[0]);

    expect(tileCacheWarmup.warmLocation).toHaveBeenCalledWith(
      component.filteredEvents()[0].latitude,
      component.filteredEvents()[0].longitude,
    );
    expect(router.navigate).toHaveBeenCalledWith(['/event', 'event-1'], {
      queryParams: { back: '/map?participacao=meus&periodo=hoje' },
    });
  });

  it('preserves an event deep link without resolving an event outside the loaded map collection', async () => {
    const component = await createPage({ query: { evento: 'missing-event' } });
    await refresh();

    component.openEventFromList(component.filteredEvents()[0]);

    expect(api.getEvents).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/event', 'event-1'], {
      queryParams: { back: '/map?evento=missing-event' },
    });
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('restores in-memory filters and releases the location lifecycle on destroy', async () => {
    const stored: StoredPublicMapState = {
      center: [-51.3, -22.2],
      zoom: 16,
      rotation: 0.2,
      filters: { audience: 'ALL', date: 'TODAY' },
    };
    const component = await createPage({ storedState: stored });

    expect(component.filters()).toEqual({ audience: 'ALL', date: 'TODAY' });

    fixture.destroy();

    expect(locationLayer.destroy).toHaveBeenCalledOnce();
  });

  async function createPage(options: {
    query?: Record<string, string>;
    isAuthenticated?: boolean;
    eventsResponse?: Observable<PublicMapEvent[]>;
    mineResponse?: Observable<Set<string>>;
    storedState?: StoredPublicMapState | null;
    dialogResult?: { audience: 'ALL' | 'MINE'; date: 'ALL' | 'TODAY' };
    permission?: 'prompt' | 'granted' | 'denied' | 'unsupported';
    locationResult?: { success: boolean; error?: string };
  } = {}): Promise<PublicMapPage> {
    authenticated = signal(options.isAuthenticated ?? false);
    user = signal(options.isAuthenticated ? { sub: 'user-1' } : null);
    api = {
      getEvents: vi.fn(() => options.eventsResponse ?? of(eventFixtures())),
      getCurrentUserEventIds: vi.fn(() => options.mineResponse ?? of(new Set<string>())),
      isUsingSavedData: signal(false),
    };
    dialog = { open: vi.fn(() => ({ afterClosed: () => of(options.dialogResult) })) };
    router = { navigate: vi.fn(() => Promise.resolve(true)), navigateByUrl: vi.fn(() => Promise.resolve(true)) };
    snackBar = { open: vi.fn() };
    permission = signal(options.permission ?? 'prompt');
    locationLayer = {
      addToMap: vi.fn(),
      startAndCenter: vi.fn().mockResolvedValue(options.locationResult ?? { success: true }),
      stopAndHide: vi.fn(),
      destroy: vi.fn(),
    };
    tileCacheWarmup = { warmLocation: vi.fn(() => Promise.resolve(true)) };
    stateStorage = { read: vi.fn(() => options.storedState ?? null), write: vi.fn() };
    const route = {
      snapshot: { queryParamMap: convertToParamMap(options.query ?? {}) },
    };

    await TestBed.configureTestingModule({
      imports: [PublicMapPage],
      providers: [
        provideNoopAnimations(),
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: PublicMapApiService, useValue: api },
        { provide: AuthService, useValue: { isAuthenticated: authenticated, user } },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: ActivatedRoute, useValue: route },
        { provide: Router, useValue: router },
        { provide: EmojiService, useValue: { getTwemojiUrl: vi.fn() } },
        {
          provide: PublicMapGeolocationService,
          useValue: { permission, isRequesting: signal(false) },
        },
        { provide: PublicUserLocationLayerService, useValue: locationLayer },
        { provide: PublicMapTileCacheWarmupService, useValue: tileCacheWarmup },
        { provide: PublicMapStateService, useValue: stateStorage },
      ],
    })
      .overrideProvider(MatDialog, { useValue: dialog })
      .overrideProvider(MatSnackBar, { useValue: snackBar })
      .compileComponents();

    fixture = TestBed.createComponent(PublicMapPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  async function refresh(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
});

function eventFixtures(): PublicMapEvent[] {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  return [
    eventFixture('event-1', today.toISOString(), today.toISOString()),
    eventFixture('event-2', tomorrow.toISOString(), tomorrow.toISOString()),
  ];
}

function eventFixture(id: string, startDate: string, endDate: string): PublicMapEvent {
  return {
    id,
    name: `Evento ${id}`,
    startDate,
    endDate,
    emoji: '📍',
    longitude: -51.40775,
    latitude: -22.12103,
  };
}

function setPrivateMap(component: PublicMapPage, map: unknown): void {
  (component as unknown as { map: unknown }).map = {
    setTarget: vi.fn(),
    dispose: vi.fn(),
    ...map as object,
  };
}
