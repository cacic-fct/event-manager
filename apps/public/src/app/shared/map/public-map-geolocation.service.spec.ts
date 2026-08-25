import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PublicMapGeolocationService } from './public-map-geolocation.service';

class FakePermissionStatus extends EventTarget {
  state: PermissionState = 'prompt';
}

class FakeDeviceOrientationEvent extends Event {
  readonly alpha: number | null;
  readonly absolute: boolean;
  readonly beta = null;
  readonly gamma = null;

  constructor(alpha: number | null, absolute = true) {
    super('deviceorientation');
    this.alpha = alpha;
    this.absolute = absolute;
  }
}

describe('PublicMapGeolocationService', () => {
  let permissionStatus: FakePermissionStatus;
  let getCurrentPosition: ReturnType<typeof vi.fn>;
  let watchPosition: ReturnType<typeof vi.fn>;
  let clearWatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    permissionStatus = new FakePermissionStatus();
    getCurrentPosition = vi.fn();
    watchPosition = vi.fn().mockReturnValue(42);
    clearWatch = vi.fn();
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue(permissionStatus) },
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition, watchPosition, clearWatch },
    });
    Object.defineProperty(window, 'DeviceOrientationEvent', {
      configurable: true,
      value: FakeDeviceOrientationEvent,
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('does not request location while checking the existing browser permission', async () => {
    permissionStatus.state = 'granted';
    const service = createService();
    await flushPromises();

    expect(navigator.permissions.query).toHaveBeenCalledWith({ name: 'geolocation' });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(service.permission()).toBe('granted');
  });

  it('reports unsupported during SSR without touching browser geolocation', async () => {
    const service = createService('server');
    await flushPromises();

    expect(service.permission()).toBe('unsupported');
    expect(service.isSupported()).toBe(false);
    await expect(service.requestLocation()).resolves.toBeNull();
    expect(service.error()).toEqual({
      code: 'unsupported',
      message: 'A localização não está disponível neste dispositivo.',
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('coalesces explicit requests and stores all available position fields', async () => {
    const service = createService();
    await flushPromises();
    let success: PositionCallback | undefined;
    getCurrentPosition.mockImplementation((callback: PositionCallback) => (success = callback));

    const first = service.requestLocation({ timeout: 9_000, maximumAge: 1_000 });
    const second = service.requestLocation();
    success?.(position({ heading: 82, speed: 2.5 }));

    await expect(first).resolves.toMatchObject({ latitude: -22.12103, longitude: -51.40775, heading: 82, speed: 2.5 });
    await expect(second).resolves.toEqual(await first);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: true,
      timeout: 9_000,
      maximumAge: 1_000,
    });
    expect(service.permission()).toBe('granted');
    expect(service.isRequesting()).toBe(false);
  });

  it.each([
    [1, 'permission-denied', 'denied'],
    [2, 'position-unavailable', 'prompt'],
    [3, 'timeout', 'prompt'],
    [99, 'unknown', 'prompt'],
  ] as const)('maps browser error %s to %s', async (code, expectedCode, expectedPermission) => {
    const service = createService();
    await flushPromises();
    getCurrentPosition.mockImplementation((_success: PositionCallback, error: PositionErrorCallback) =>
      error({ code, message: 'failure' } as GeolocationPositionError),
    );

    await expect(service.requestLocation()).resolves.toBeNull();
    expect(service.error()?.code).toBe(expectedCode);
    expect(service.permission()).toBe(expectedPermission);
  });

  it('starts position and compass tracking only after the explicit call, then cleans both up', async () => {
    const service = createService();
    await flushPromises();
    getCurrentPosition.mockImplementation((success: PositionCallback) => success(position()));

    await expect(service.startTracking({ trackOrientation: true })).resolves.toBe(true);
    expect(watchPosition).toHaveBeenCalledTimes(1);
    expect(service.isTracking()).toBe(true);
    expect(service.isTrackingOrientation()).toBe(true);

    window.dispatchEvent(new FakeDeviceOrientationEvent(30, true));
    expect(service.orientation()).toMatchObject({ heading: 330, absolute: true });

    const watchedSuccess = watchPosition.mock.calls[0][0] as PositionCallback;
    watchedSuccess(position({ latitude: -22.2 }));
    expect(service.location()?.latitude).toBe(-22.2);

    service.stopTracking();
    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(service.isTracking()).toBe(false);
    expect(service.isTrackingOrientation()).toBe(false);
    expect(service.orientation()).toBeNull();
  });

  it('uses the iOS compass heading after an explicit orientation permission grant', async () => {
    class IosOrientationEvent extends FakeDeviceOrientationEvent {
      static requestPermission = vi.fn().mockResolvedValue('granted');
      readonly webkitCompassHeading = 17;
    }
    Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, value: IosOrientationEvent });
    const service = createService();
    await flushPromises();
    getCurrentPosition.mockImplementation((success: PositionCallback) => success(position()));

    await service.startTracking({ trackOrientation: true });
    expect(IosOrientationEvent.requestPermission).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new IosOrientationEvent(100));
    expect(service.orientation()?.heading).toBe(17);
  });

  it('continues location tracking when optional compass permission is denied', async () => {
    class IosOrientationEvent extends FakeDeviceOrientationEvent {
      static requestPermission = vi.fn().mockResolvedValue('denied');
    }
    Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, value: IosOrientationEvent });
    const service = createService();
    await flushPromises();
    getCurrentPosition.mockImplementation((success: PositionCallback) => success(position()));

    await expect(service.startTracking({ trackOrientation: true })).resolves.toBe(true);
    expect(service.orientationPermission()).toBe('denied');
    expect(service.isTracking()).toBe(true);
    expect(service.isTrackingOrientation()).toBe(false);
  });

  it('does not request compass access when location is already denied', async () => {
    class IosOrientationEvent extends FakeDeviceOrientationEvent {
      static requestPermission = vi.fn().mockResolvedValue('granted');
    }
    Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, value: IosOrientationEvent });
    permissionStatus.state = 'denied';
    const service = createService();
    await flushPromises();

    await expect(service.startTracking({ trackOrientation: true })).resolves.toBe(false);
    expect(IosOrientationEvent.requestPermission).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(service.error()?.code).toBe('permission-denied');
  });

  it('returns a controlled error when the browser throws while registering a watcher', async () => {
    const service = createService();
    await flushPromises();
    getCurrentPosition.mockImplementation((success: PositionCallback) => success(position()));
    watchPosition.mockImplementation(() => {
      throw new Error('watch failed');
    });

    await expect(service.startTracking()).resolves.toBe(false);
    expect(service.error()?.code).toBe('unknown');
    expect(service.isTracking()).toBe(false);
  });

  it('stops tracking and clears the location when permission is revoked', async () => {
    permissionStatus.state = 'granted';
    const service = createService();
    await flushPromises();
    getCurrentPosition.mockImplementation((success: PositionCallback) => success(position()));
    await service.startTracking();

    permissionStatus.state = 'denied';
    permissionStatus.dispatchEvent(new Event('change'));

    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(service.location()).toBeNull();
    expect(service.permission()).toBe('denied');
    expect(service.error()?.code).toBe('permission-denied');
  });

  it('cleans active browser watchers when its injection context is destroyed', async () => {
    const service = createService();
    await flushPromises();
    getCurrentPosition.mockImplementation((success: PositionCallback) => success(position()));
    await service.startTracking({ trackOrientation: true });

    TestBed.resetTestingModule();
    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(service.isTracking()).toBe(false);
  });

  function createService(platformId = 'browser'): PublicMapGeolocationService {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platformId }] });
    return TestBed.inject(PublicMapGeolocationService);
  }
});

function position(overrides: Partial<GeolocationCoordinates> = {}): GeolocationPosition {
  return {
    coords: {
      latitude: -22.12103,
      longitude: -51.40775,
      accuracy: 18,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
      ...overrides,
    },
    timestamp: 1_777_777_777,
    toJSON: () => ({}),
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
