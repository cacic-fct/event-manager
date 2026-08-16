import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, NgZone, PLATFORM_ID, computed, inject, signal } from '@angular/core';

export type PublicMapLocationPermission = 'prompt' | 'granted' | 'denied' | 'unsupported';
export type PublicMapOrientationPermission = PublicMapLocationPermission;

export type PublicMapGeolocationErrorCode =
  | 'permission-denied'
  | 'position-unavailable'
  | 'timeout'
  | 'unsupported'
  | 'unknown';

export type PublicMapGeolocationError = Readonly<{
  code: PublicMapGeolocationErrorCode;
  message: string;
}>;

export type PublicMapUserLocation = Readonly<{
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}>;

export type PublicMapDeviceOrientation = Readonly<{
  heading: number;
  absolute: boolean;
  timestamp: number;
}>;

export type PublicMapTrackingOptions = Readonly<{
  trackOrientation?: boolean;
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}>;

const DEFAULT_OPTIONS: Required<Omit<PublicMapTrackingOptions, 'trackOrientation'>> = {
  enableHighAccuracy: true,
  timeout: 30_000,
  maximumAge: 0,
};

const GEOLOCATION_PERMISSION_DENIED = 1;
const GEOLOCATION_POSITION_UNAVAILABLE = 2;
const GEOLOCATION_TIMEOUT = 3;

type DeviceOrientationEventWithCompass = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

type DeviceOrientationEventConstructorWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/**
 * Map-specific browser location state. None of its initialization code prompts
 * for permission; consumers must call requestLocation() or startTracking() from
 * an explicit user action.
 */
@Injectable({ providedIn: 'root' })
export class PublicMapGeolocationService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private watchId: number | null = null;
  private permissionStatus: PermissionStatus | null = null;
  private requestInFlight: Promise<PublicMapUserLocation | null> | null = null;
  private orientationHandler: ((event: DeviceOrientationEvent) => void) | null = null;

  readonly permission = signal<PublicMapLocationPermission>('prompt');
  readonly orientationPermission = signal<PublicMapOrientationPermission>('prompt');
  readonly location = signal<PublicMapUserLocation | null>(null);
  readonly orientation = signal<PublicMapDeviceOrientation | null>(null);
  readonly error = signal<PublicMapGeolocationError | null>(null);
  readonly isRequesting = signal(false);
  readonly isTracking = signal(false);
  readonly isTrackingOrientation = signal(false);
  readonly isSupported = computed(
    () => isPlatformBrowser(this.platformId) && typeof navigator !== 'undefined' && 'geolocation' in navigator,
  );
  readonly isOrientationSupported = computed(
    () => isPlatformBrowser(this.platformId) && typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
  );
  readonly isDisabled = computed(() => this.permission() === 'denied' || this.permission() === 'unsupported');

  constructor() {
    void this.initializePermissionState();
    this.destroyRef.onDestroy(() => this.destroy());
  }

  async requestLocation(options: PublicMapTrackingOptions = {}): Promise<PublicMapUserLocation | null> {
    if (!this.isSupported()) {
      this.permission.set('unsupported');
      this.setError('unsupported');
      return null;
    }
    if (this.permission() === 'denied') {
      this.setError('permission-denied');
      return null;
    }
    if (this.requestInFlight) {
      return this.requestInFlight;
    }

    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    this.isRequesting.set(true);
    this.error.set(null);
    this.requestInFlight = new Promise<PublicMapUserLocation | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = this.mapLocation(position);
          this.zone.run(() => {
            this.location.set(location);
            this.permission.set('granted');
            resolve(location);
          });
        },
        (error) => {
          this.zone.run(() => {
            this.handlePositionError(error);
            resolve(null);
          });
        },
        this.toPositionOptions(mergedOptions),
      );
    })
      .catch(() => {
        this.zone.run(() => this.setError('unknown'));
        return null;
      })
      .finally(() => {
        this.zone.run(() => {
          this.isRequesting.set(false);
          this.requestInFlight = null;
        });
      });

    return this.requestInFlight;
  }

  async startTracking(options: PublicMapTrackingOptions = {}): Promise<boolean> {
    if (this.isTracking()) {
      return true;
    }
    if (!this.isSupported() || this.permission() === 'denied') {
      await this.requestLocation(options);
      return false;
    }

    // iOS requires this call while user activation is still current, so start
    // it before awaiting the location permission prompt.
    const orientationPermission = options.trackOrientation
      ? this.requestOrientationPermission()
      : Promise.resolve(false);
    const initialLocation = await this.requestLocation(options);
    const canTrackOrientation = await orientationPermission;
    if (!initialLocation || !this.isSupported()) {
      return false;
    }

    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    try {
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this.zone.run(() => this.location.set(this.mapLocation(position))),
        (error) => this.zone.run(() => this.handlePositionError(error)),
        this.toPositionOptions(mergedOptions),
      );
    } catch {
      this.setError('unknown');
      this.stopOrientationTracking();
      return false;
    }
    this.isTracking.set(true);
    if (canTrackOrientation) {
      this.addOrientationListener();
    }
    return true;
  }

  stopTracking(): void {
    if (this.watchId !== null && this.isSupported()) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
    this.isTracking.set(false);
    this.stopOrientationTracking();
  }

  clearError(): void {
    this.error.set(null);
  }

  private async initializePermissionState(): Promise<void> {
    if (!this.isSupported()) {
      this.permission.set('unsupported');
      return;
    }
    if (!('permissions' in navigator)) {
      return;
    }

    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      if (this.destroyRef.destroyed) {
        return;
      }
      this.permissionStatus = status;
      this.permission.set(status.state);
      status.addEventListener('change', this.onPermissionChange);
    } catch {
      this.permission.set('prompt');
    }
  }

  private readonly onPermissionChange = (): void => {
    const state = this.permissionStatus?.state;
    if (!state) {
      return;
    }
    this.zone.run(() => {
      this.permission.set(state);
      if (state === 'denied') {
        this.stopTracking();
        this.location.set(null);
        this.setError('permission-denied');
      }
    });
  };

  private async requestOrientationPermission(): Promise<boolean> {
    if (!this.isOrientationSupported()) {
      this.orientationPermission.set('unsupported');
      return false;
    }

    const constructor = window.DeviceOrientationEvent as DeviceOrientationEventConstructorWithPermission;
    if (typeof constructor.requestPermission !== 'function') {
      this.orientationPermission.set('granted');
      return true;
    }

    try {
      const result = await constructor.requestPermission();
      this.orientationPermission.set(result);
      return result === 'granted';
    } catch {
      this.orientationPermission.set('denied');
      return false;
    }
  }

  private addOrientationListener(): void {
    if (this.orientationHandler || !this.isOrientationSupported()) {
      return;
    }
    this.orientationHandler = (event) => {
      const compassHeading = (event as DeviceOrientationEventWithCompass).webkitCompassHeading;
      const rawHeading = typeof compassHeading === 'number' && Number.isFinite(compassHeading)
        ? compassHeading
        : event.alpha === null
          ? null
          : 360 - event.alpha;
      if (rawHeading === null) {
        return;
      }
      const heading = ((rawHeading % 360) + 360) % 360;
      this.zone.run(() =>
        this.orientation.set({ heading, absolute: event.absolute, timestamp: Date.now() }),
      );
    };
    window.addEventListener('deviceorientation', this.orientationHandler, true);
    this.isTrackingOrientation.set(true);
  }

  private stopOrientationTracking(): void {
    if (this.orientationHandler && isPlatformBrowser(this.platformId)) {
      window.removeEventListener('deviceorientation', this.orientationHandler, true);
    }
    this.orientationHandler = null;
    this.isTrackingOrientation.set(false);
    this.orientation.set(null);
  }

  private handlePositionError(error: GeolocationPositionError): void {
    switch (error.code) {
      case GEOLOCATION_PERMISSION_DENIED:
        this.permission.set('denied');
        this.location.set(null);
        this.stopTracking();
        this.setError('permission-denied');
        break;
      case GEOLOCATION_POSITION_UNAVAILABLE:
        this.setError('position-unavailable');
        break;
      case GEOLOCATION_TIMEOUT:
        this.setError('timeout');
        break;
      default:
        this.setError('unknown');
    }
  }

  private setError(code: PublicMapGeolocationErrorCode): void {
    const messages: Record<PublicMapGeolocationErrorCode, string> = {
      'permission-denied': 'O acesso à localização foi bloqueado. Permita o acesso nas configurações do navegador.',
      'position-unavailable': 'Não foi possível determinar sua localização agora.',
      timeout: 'A localização demorou demais para responder. Tente novamente.',
      unsupported: 'A localização não está disponível neste dispositivo.',
      unknown: 'Não foi possível acessar sua localização.',
    };
    this.error.set({ code, message: messages[code] });
  }

  private mapLocation(position: GeolocationPosition): PublicMapUserLocation {
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      timestamp: position.timestamp,
    };
  }

  private toPositionOptions(
    options: Required<Omit<PublicMapTrackingOptions, 'trackOrientation'>>,
  ): PositionOptions {
    return {
      enableHighAccuracy: options.enableHighAccuracy,
      timeout: options.timeout,
      maximumAge: options.maximumAge,
    };
  }

  private destroy(): void {
    this.stopTracking();
    this.permissionStatus?.removeEventListener('change', this.onPermissionChange);
    this.permissionStatus = null;
  }
}
