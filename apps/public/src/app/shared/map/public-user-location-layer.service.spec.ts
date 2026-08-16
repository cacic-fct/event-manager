import { TestBed } from '@angular/core/testing';
import Map from 'ol/Map';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { signal } from '@angular/core';
import {
  PublicMapDeviceOrientation,
  PublicMapGeolocationError,
  PublicMapGeolocationService,
  PublicMapUserLocation,
} from './public-map-geolocation.service';
import { PublicUserLocationLayerService } from './public-user-location-layer.service';

describe('PublicUserLocationLayerService', () => {
  const location = signal<PublicMapUserLocation | null>(null);
  const orientation = signal<PublicMapDeviceOrientation | null>(null);
  const error = signal<PublicMapGeolocationError | null>(null);
  const startTracking = vi.fn();
  const stopTracking = vi.fn();
  const requestLocation = vi.fn();
  let addedLayer: VectorLayer<VectorSource> | null;
  let map: Map;
  let service: PublicUserLocationLayerService;

  beforeEach(() => {
    location.set(null);
    orientation.set(null);
    error.set(null);
    startTracking.mockReset();
    stopTracking.mockReset();
    requestLocation.mockReset();
    addedLayer = null;
    map = {
      addLayer: vi.fn((layer: VectorLayer<VectorSource>) => (addedLayer = layer)),
      removeLayer: vi.fn(),
      getView: () => new View({ center: [0, 0], zoom: 18 }),
    } as unknown as Map;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PublicMapGeolocationService,
          useValue: { location, orientation, error, startTracking, stopTracking, requestLocation },
        },
      ],
    });
    service = TestBed.inject(PublicUserLocationLayerService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('adds one high-priority vector layer and replaces it safely on reattachment', () => {
    service.addToMap(map);
    const firstLayer = addedLayer;
    service.addToMap(map);

    expect(map.addLayer).toHaveBeenCalledTimes(2);
    expect(map.removeLayer).toHaveBeenCalledWith(firstLayer);
    expect(addedLayer?.getZIndex()).toBe(1_000);
  });

  it('starts only on show and renders accuracy, direction, and dot features', async () => {
    service.addToMap(map);
    startTracking.mockImplementation(async () => {
      location.set(userLocation());
      orientation.set({ heading: 45, absolute: true, timestamp: 10 });
      return true;
    });

    expect(startTracking).not.toHaveBeenCalled();
    await expect(service.show()).resolves.toBe(true);

    const source = addedLayer?.getSource();
    expect(startTracking).toHaveBeenCalledWith({ trackOrientation: true });
    expect(source?.getFeatureById('public-user-location-accuracy')).toBeTruthy();
    expect(source?.getFeatureById('public-user-location-direction')).toBeTruthy();
    expect(source?.getFeatureById('public-user-location-dot')).toBeTruthy();
  });

  it('updates moving features and removes the direction when no heading remains', async () => {
    service.addToMap(map);
    startTracking.mockResolvedValue(true);
    location.set(userLocation());
    orientation.set({ heading: 90, absolute: true, timestamp: 10 });
    await service.show();
    const source = addedLayer?.getSource();
    const dot = source?.getFeatureById('public-user-location-dot');

    location.set(userLocation({ latitude: -22.2 }));
    TestBed.flushEffects();
    expect(source?.getFeatureById('public-user-location-dot')).toBe(dot);

    orientation.set(null);
    location.set(userLocation({ heading: null }));
    TestBed.flushEffects();
    expect(source?.getFeatureById('public-user-location-direction')).toBeNull();
  });

  it('stops privacy-sensitive watchers and clears all features when hidden', async () => {
    service.addToMap(map);
    startTracking.mockResolvedValue(true);
    location.set(userLocation());
    await service.show();

    service.stopAndHide();

    expect(stopTracking).toHaveBeenCalledTimes(1);
    expect(addedLayer?.getSource()?.getFeatures()).toHaveLength(0);
  });

  it('returns the mapped error and stops when start-and-center fails', async () => {
    error.set({ code: 'permission-denied', message: 'Bloqueado.' });
    startTracking.mockResolvedValue(false);

    await expect(service.startAndCenter(map)).resolves.toEqual({
      success: false,
      error: 'Bloqueado.',
    });
    expect(stopTracking).toHaveBeenCalledTimes(1);
  });

  it('starts, renders, and animates to the user with the requested zoom', async () => {
    const view = new View({ center: [0, 0], zoom: 5 });
    vi.spyOn(view, 'animate').mockImplementation(() => undefined);
    vi.spyOn(map, 'getView').mockReturnValue(view);
    startTracking.mockImplementation(async () => {
      location.set(userLocation());
      return true;
    });

    await expect(service.startAndCenter(map, 17)).resolves.toEqual({ success: true });
    expect(view.animate).toHaveBeenCalledWith(expect.objectContaining({ zoom: 17, duration: 450 }));
  });

  it('requests a one-shot location for centering when tracking has no value', async () => {
    const view = new View({ center: [0, 0], zoom: 18 });
    vi.spyOn(view, 'animate').mockImplementation(() => undefined);
    vi.spyOn(map, 'getView').mockReturnValue(view);
    service.addToMap(map);
    requestLocation.mockResolvedValue(userLocation());

    await expect(service.centerOnUser()).resolves.toBe(true);
    expect(requestLocation).toHaveBeenCalledTimes(1);
    expect(view.animate).toHaveBeenCalled();
  });

  it('stops tracking and detaches the layer on destroy', () => {
    service.addToMap(map);
    service.destroy();

    expect(stopTracking).toHaveBeenCalledTimes(1);
    expect(map.removeLayer).toHaveBeenCalledWith(addedLayer);
  });
});

function userLocation(overrides: Partial<PublicMapUserLocation> = {}): PublicMapUserLocation {
  return {
    latitude: -22.12103,
    longitude: -51.40775,
    accuracy: 20,
    altitude: null,
    altitudeAccuracy: null,
    heading: 10,
    speed: null,
    timestamp: 10,
    ...overrides,
  };
}
