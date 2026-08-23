import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AttendanceHeatmapComponent } from './attendance-heatmap.component';

const openLayers = vi.hoisted(() => {
  const maps: Array<{ options: Record<string, unknown>; setTarget: ReturnType<typeof vi.fn>; updateSize: ReturnType<typeof vi.fn> }> = [];

  class Feature {
    readonly set = vi.fn();
    readonly setStyle = vi.fn();

    constructor(readonly options: Record<string, unknown>) {}
  }

  class Layer {
    constructor(readonly options: Record<string, unknown>) {}
  }

  class View extends Layer {
    readonly fit = vi.fn();
  }

  class Map {
    readonly setTarget = vi.fn();
    readonly updateSize = vi.fn();

    constructor(readonly options: Record<string, unknown>) {
      maps.push(this);
    }
  }

  return { Feature, Layer, Map, View, maps };
});

vi.mock('ol/Feature', () => ({ default: openLayers.Feature }));
vi.mock('ol/Map', () => ({ default: openLayers.Map }));
vi.mock('ol/View', () => ({ default: openLayers.View }));
vi.mock('ol/extent', () => ({ boundingExtent: (coordinates: number[][]) => coordinates }));
vi.mock('ol/geom/Point', () => ({ default: openLayers.Layer }));
vi.mock('ol/layer/Heatmap', () => ({ default: openLayers.Layer }));
vi.mock('ol/layer/Tile', () => ({ default: openLayers.Layer }));
vi.mock('ol/layer/Vector', () => ({ default: openLayers.Layer }));
vi.mock('ol/proj', () => ({ fromLonLat: (coordinates: number[]) => coordinates }));
vi.mock('ol/source/OSM', () => ({ default: openLayers.Layer }));
vi.mock('ol/source/Vector', () => ({ default: openLayers.Layer }));
vi.mock('ol/style', () => ({
  Circle: openLayers.Layer,
  Fill: openLayers.Layer,
  Stroke: openLayers.Layer,
  Style: openLayers.Layer,
}));

describe('AttendanceHeatmapComponent', () => {
  let animationFrameCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    openLayers.maps.length = 0;
    animationFrameCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  function createFixture(platformId: 'browser' | 'server' = 'server') {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platformId }] });
    return TestBed.createComponent(AttendanceHeatmapComponent);
  }

  function flushAnimationFrames(): void {
    const callbacks = animationFrameCallbacks.splice(0);
    callbacks.forEach((callback) => callback(0));
  }

  it('explains why the map is empty when neither scans nor event coordinates are available', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    expect(fixture.componentInstance.hasLocationData()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Nenhuma presença desta janela contém localização.');
    expect(fixture.nativeElement.querySelector('[role="img"]')).toBeNull();
  });

  it('keeps the map region available when only the known event location can anchor it', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('eventLatitude', -20.76162);
    fixture.componentRef.setInput('eventLongitude', -41.53316);
    fixture.detectChanges();

    expect(fixture.componentInstance.hasLocationData()).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Mapa de calor dos locais onde as presenças foram coletadas',
    );
  });

  it('accepts scan locations without requiring an event coordinate', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('points', [
      { latitude: -20.76, longitude: -41.53, count: 4, averageAccuracyMeters: 12 },
    ]);
    fixture.detectChanges();

    expect(fixture.componentInstance.hasLocationData()).toBe(true);
  });

  it('renders the map after location data adds the map target to the view', async () => {
    const fixture = createFixture('browser');
    fixture.detectChanges();

    expect(openLayers.maps).toHaveLength(0);

    fixture.componentRef.setInput('points', [
      { latitude: -20.76, longitude: -41.53, count: 4, averageAccuracyMeters: 12 },
    ]);
    fixture.detectChanges();

    await vi.waitFor(() => expect(animationFrameCallbacks).not.toHaveLength(0));
    flushAnimationFrames();
    await vi.waitFor(() => expect(openLayers.maps).toHaveLength(1));
    expect(openLayers.maps[0].options['target']).toBe(fixture.nativeElement.querySelector('.attendance-heatmap'));
  });

  it('uses the OpenLayers view to fit all visible locations', async () => {
    const fixture = createFixture('browser');
    fixture.componentRef.setInput('points', [
      { latitude: -20.76, longitude: -41.53, count: 4, averageAccuracyMeters: 12 },
      { latitude: -20.77, longitude: -41.54, count: 2, averageAccuracyMeters: 18 },
    ]);
    fixture.componentRef.setInput('eventLatitude', -20.76162);
    fixture.componentRef.setInput('eventLongitude', -41.53316);
    fixture.detectChanges();

    await vi.waitFor(() => expect(animationFrameCallbacks).not.toHaveLength(0));
    flushAnimationFrames();
    await vi.waitFor(() => expect(openLayers.maps).toHaveLength(1));
    const view = openLayers.maps[0].options['view'] as InstanceType<typeof openLayers.View>;
    expect(view.fit).toHaveBeenCalledWith(
      [[-41.53, -20.76], [-41.54, -20.77], [-41.53316, -20.76162]],
      { maxZoom: 17, padding: [32, 32, 32, 32] },
    );
  });

  it('detaches the map when location data is removed', async () => {
    const fixture = createFixture('browser');
    fixture.componentRef.setInput('points', [
      { latitude: -20.76, longitude: -41.53, count: 4, averageAccuracyMeters: 12 },
    ]);
    fixture.detectChanges();
    await vi.waitFor(() => expect(animationFrameCallbacks).not.toHaveLength(0));
    flushAnimationFrames();
    await vi.waitFor(() => expect(openLayers.maps).toHaveLength(1));

    fixture.componentRef.setInput('points', []);
    fixture.detectChanges();

    await vi.waitFor(() => expect(animationFrameCallbacks).not.toHaveLength(0));
    flushAnimationFrames();
    await vi.waitFor(() => expect(openLayers.maps[0].setTarget).toHaveBeenCalledWith(undefined));
    expect(fixture.nativeElement.querySelector('.attendance-heatmap')).toBeNull();
  });
});
