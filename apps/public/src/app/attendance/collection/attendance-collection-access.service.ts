import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AttendanceOfflineQueueService } from '@cacic-fct/offline-public-data-access';
import { AuthService } from '@cacic-fct/shared-angular';
import { addHours, isValid, isWithinInterval, parseISO, subHours } from 'date-fns';
import { firstValueFrom, map } from 'rxjs';
import { AttendanceCollectionApiService, AttendanceCollectionEvent, AttendanceCollectionLocation } from './attendance-collection-api.service';

export const MAX_ATTENDANCE_COLLECTION_LOCATION_ACCURACY_METERS = 100;

@Injectable({ providedIn: 'root' })
export class AttendanceCollectionAccessService {
  private readonly platformId = inject(PLATFORM_ID);

  isCollectionOpen(item: AttendanceCollectionEvent): boolean {
    const start = parseISO(item.event.startDate);
    const end = parseISO(item.event.endDate);
    return (
      isValid(start) &&
      isValid(end) &&
      isWithinInterval(new Date(), {
        start: subHours(start, 3),
        end: addHours(end, 6),
      })
    );
  }

  getPreciseLocation(): Promise<AttendanceCollectionLocation> {
    return new Promise((resolve, reject) => {
      if (!isPlatformBrowser(this.platformId)) {
        reject(new Error("Browser didn't provide location."));
        return;
      }

      if (!navigator.geolocation) {
        reject(new Error("Browser didn't provide location."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const accuracyMeters = position.coords.accuracy;
          if (!Number.isFinite(position.coords.latitude) || !Number.isFinite(position.coords.longitude)) {
            reject(new Error("Browser didn't provide location."));
            return;
          }

          if (!Number.isFinite(accuracyMeters)) {
            reject(new Error("Browser didn't provide location accuracy."));
            return;
          }

          if (accuracyMeters > MAX_ATTENDANCE_COLLECTION_LOCATION_ACCURACY_METERS) {
            reject(new Error(`Ative a localização precisa. O navegador informou precisão de ${Math.round(accuracyMeters)} m.`));
            return;
          }

          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters,
          });
        },
        (error) => reject(new Error(this.getGeolocationErrorMessage(error))),
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 12_000,
        },
      );
    });
  }

  private getGeolocationErrorMessage(error: GeolocationPositionError): string {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'Permita o acesso à localização precisa para continuar.';
      case error.POSITION_UNAVAILABLE:
        return "Browser didn't provide location.";
      case error.TIMEOUT:
        return 'Tempo esgotado ao solicitar localização. Tente novamente com o GPS ativo.';
      default:
        return error.message || "Browser didn't provide location.";
    }
  }
}

export const attendanceCollectionListGuard: CanActivateFn = async () => {
  const api = inject(AttendanceCollectionApiService);
  const auth = inject(AuthService);
  const offlineQueue = inject(AttendanceOfflineQueueService);
  const router = inject(Router);

  try {
    const events = await firstValueFrom(api.listCollectionEvents());
    if (events.length > 0) {
      return true;
    }
  } catch {
    const userId = auth.user()?.sub;
    if (userId && (await offlineQueue.getCollectionEvents(userId)).length > 0) {
      return true;
    }
  }

  return router.createUrlTree(['/menu']);
};

export const attendanceCollectionScannerGuard: CanActivateFn = async (route) => {
  const api = inject(AttendanceCollectionApiService);
  const access = inject(AttendanceCollectionAccessService);
  const auth = inject(AuthService);
  const offlineQueue = inject(AttendanceOfflineQueueService);
  const router = inject(Router);
  const eventId = route.paramMap.get('eventId');

  if (!eventId) {
    return router.createUrlTree(['/attendance/collect']);
  }

  try {
    const canCollectEvent = await firstValueFrom(
      api.listCollectionEvents().pipe(map((events) => events.some((event) => event.eventId === eventId && access.isCollectionOpen(event)))),
    );
    if (!canCollectEvent) {
      return router.createUrlTree(['/attendance/collect']);
    }

    await access.getPreciseLocation();
    return true;
  } catch {
    const userId = auth.user()?.sub;
    const cachedEvent = userId && eventId ? await offlineQueue.getCollectionEvent(userId, eventId) : null;
    if (cachedEvent && access.isCollectionOpen(cachedEvent)) {
      try {
        await access.getPreciseLocation();
        return true;
      } catch {
        return router.createUrlTree(['/attendance/collect']);
      }
    }
  }

  return router.createUrlTree(['/attendance/collect']);
};
