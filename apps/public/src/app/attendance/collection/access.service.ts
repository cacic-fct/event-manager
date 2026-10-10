import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Service, PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AttendanceOfflineQueueService } from '@cacic-fct/public-indexed-db';
import { AuthService, authGuard } from '@cacic-fct/shared-angular';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';
import { Permission } from '@cacic-fct/shared-permissions';
import { addHours, isValid, isWithinInterval, parseISO, subHours } from 'date-fns';
import { firstValueFrom } from 'rxjs';
import { ForbiddenGraphqlError, NotFoundGraphqlError } from '../../shared/rate-limit-error';
import { privateResourceErrorStatus, routePageErrorStatus } from '../../shared/route-error-handling';
import {
  AttendanceCollectionApiService,
  AttendanceCollectionEvent,
  AttendanceCollectionLocation,
} from './attendance-collection-api.service';

export const MAX_ATTENDANCE_COLLECTION_LOCATION_ACCURACY_METERS = 100;

@Service()
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
            reject(
              new Error(
                `Ative a localização precisa. O navegador informou precisão de ${Math.round(accuracyMeters)} m.`,
              ),
            );
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

const COLLECTION_PERMISSIONS = [
  Permission.EventAttendance.Collect,
  Permission.EventAttendance.Import,
  Permission.EventAttendance.Update,
] as const;

export const attendanceCollectionListGuard: CanActivateFn = async (route, state) => {
  const api = inject(AttendanceCollectionApiService);
  const auth = inject(AuthService);
  const offlineQueue = inject(AttendanceOfflineQueueService);
  const router = inject(Router);
  const errors = inject(RouteErrorService);
  const authResult = await authGuard(route, state);
  if (authResult !== true) return authResult;

  let events: AttendanceCollectionEvent[];
  try {
    events = await firstValueFrom(api.listCollectionEvents());
  } catch (error: unknown) {
    if (isPermissionDenied(error)) {
      return errors.guardRedirect(403);
    }
    const userId = auth.user()?.sub;
    try {
      if (userId && (await offlineQueue.getCollectionEvents(userId)).length > 0) {
        return true;
      }
    } catch {
      return errors.guardRedirect(503);
    }
    return errors.guardRedirect(privateResourceErrorStatus(error));
  }

  if (events.length > 0) {
    return true;
  }

  try {
    const grantedPermissions = await firstValueFrom(auth.evaluatePermissions(COLLECTION_PERMISSIONS));
    if (grantedPermissions.length === 0) return errors.guardRedirect(403);
  } catch (error: unknown) {
    if (isPermissionDenied(error)) return errors.guardRedirect(403);
    return errors.guardRedirect(routePageErrorStatus(error));
  }

  return router.createUrlTree(['/menu']);
};

export const attendanceCollectionScannerGuard: CanActivateFn = async (route, state) => {
  const api = inject(AttendanceCollectionApiService);
  const access = inject(AttendanceCollectionAccessService);
  const auth = inject(AuthService);
  const offlineQueue = inject(AttendanceOfflineQueueService);
  const router = inject(Router);
  const errors = inject(RouteErrorService);
  const eventId = route.paramMap.get('eventId');
  const authResult = await authGuard(route, state);
  if (authResult !== true) return authResult;

  if (!eventId) {
    return errors.guardRedirect(404);
  }

  let event: AttendanceCollectionEvent | undefined;
  let apiError: unknown;
  try {
    const events = await firstValueFrom(api.listCollectionEvents());
    event = events.find((item) => item.eventId === eventId);
  } catch (error: unknown) {
    apiError = error;
    if (isResourceMissing(error) || isPermissionDenied(error)) {
      return errors.guardRedirect(404);
    }
    const userId = auth.user()?.sub;
    try {
      const cachedEvent = userId ? await offlineQueue.getCollectionEvent(userId, eventId) : null;
      if (cachedEvent) event = cachedEvent;
    } catch {
      return errors.guardRedirect(503);
    }
  }

  if (!event || !access.isCollectionOpen(event)) {
    const status = apiError ? privateResourceErrorStatus(apiError) : 404;
    return errors.guardRedirect(status);
  }

  try {
    await access.getPreciseLocation();
    return true;
  } catch {
    return router.createUrlTree(['/attendance/collect']);
  }
};

function isPermissionDenied(error: unknown): boolean {
  return error instanceof ForbiddenGraphqlError || (error instanceof HttpErrorResponse && error.status === 403);
}

function isResourceMissing(error: unknown): boolean {
  return error instanceof NotFoundGraphqlError || (error instanceof HttpErrorResponse && error.status === 404);
}
