import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AttendanceOfflineQueueService } from '@cacic-fct/public-indexed-db';
import { AuthService } from '@cacic-fct/shared-angular';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';
import { Permission } from '@cacic-fct/shared-permissions';
import { of, throwError } from 'rxjs';
import { ForbiddenGraphqlError } from '../../shared/rate-limit-error';
import {
  AttendanceCollectionAccessService,
  attendanceCollectionListGuard,
  attendanceCollectionScannerGuard,
} from './access.service';
import { AttendanceCollectionApiService } from './attendance-collection-api.service';

describe('attendance collection guards', () => {
  let api: { listCollectionEvents: ReturnType<typeof vi.fn> };
  let auth: {
    consumePostLogoutRedirect: ReturnType<typeof vi.fn>;
    ensureAuthenticated: ReturnType<typeof vi.fn>;
    evaluatePermissions: ReturnType<typeof vi.fn>;
    isAuthenticated: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    user: ReturnType<typeof vi.fn>;
  };
  let errors: { guardRedirect: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(() => {
    api = { listCollectionEvents: vi.fn(() => of([])) };
    auth = {
      consumePostLogoutRedirect: vi.fn(() => false),
      ensureAuthenticated: vi.fn().mockResolvedValue(true),
      evaluatePermissions: vi.fn(() => of([])),
      isAuthenticated: vi.fn(() => false),
      login: vi.fn().mockResolvedValue(undefined),
      user: vi.fn(() => ({ sub: 'collector-user' })),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AttendanceCollectionApiService, useValue: api },
        { provide: AttendanceOfflineQueueService, useValue: { getCollectionEvents: vi.fn(() => Promise.resolve([])), getCollectionEvent: vi.fn(() => Promise.resolve(null)) } },
        { provide: AttendanceCollectionAccessService, useValue: { isCollectionOpen: vi.fn(() => true), getPreciseLocation: vi.fn(() => Promise.resolve({ latitude: 0, longitude: 0, accuracyMeters: 1 })) } },
        { provide: AuthService, useValue: auth },
        {
          provide: RouteErrorService,
          useValue: {
            guardRedirect: vi.fn((status: number) => router.parseUrl(`/error/${status}`)),
          },
        },
      ],
    });
    router = TestBed.inject(Router);
    errors = TestBed.inject(RouteErrorService) as unknown as typeof errors;
  });

  it('shows shared 403 when the collector has no collection permissions or current event assignments', async () => {
    const result = await runListGuard('/attendance/collect');

    expect(auth.ensureAuthenticated).toHaveBeenCalledOnce();
    expect(api.listCollectionEvents).toHaveBeenCalledOnce();
    expect(auth.evaluatePermissions).toHaveBeenCalledWith([
      Permission.EventAttendance.Collect,
      Permission.EventAttendance.Import,
      Permission.EventAttendance.Update,
    ]);
    expect(errors.guardRedirect).toHaveBeenCalledWith(403);
    expect(router.serializeUrl(result as UrlTree)).toBe('/error/403');
  });

  it('starts Keycloak login with the requested scanner route before calling private APIs', async () => {
    auth.ensureAuthenticated.mockResolvedValue(false);
    const route = { paramMap: { get: () => 'event-private' } } as unknown as ActivatedRouteSnapshot;
    const state = { url: '/attendance/collect/event-private/scanner' } as RouterStateSnapshot;

    const result = await TestBed.runInInjectionContext(() => attendanceCollectionScannerGuard(route, state));

    expect(result).toBe(false);
    expect(auth.login).toHaveBeenCalledWith({ returnTo: state.url });
    expect(api.listCollectionEvents).not.toHaveBeenCalled();
  });

  it('masks a denied or missing collector event id as shared not found', async () => {
    api.listCollectionEvents.mockReturnValueOnce(throwError(() => new ForbiddenGraphqlError('forbidden')));
    auth.evaluatePermissions.mockReturnValue(of([Permission.EventAttendance.Collect]));
    const route = { paramMap: { get: () => 'event-private' } } as unknown as ActivatedRouteSnapshot;

    const result = await TestBed.runInInjectionContext(() =>
      attendanceCollectionScannerGuard(route, { url: '/attendance/collect/event-private' } as RouterStateSnapshot),
    );

    expect(errors.guardRedirect).toHaveBeenCalledWith(404);
    expect(router.serializeUrl(result as UrlTree)).toBe('/error/404');
  });

  async function runListGuard(url: string): Promise<unknown> {
    return TestBed.runInInjectionContext(() =>
      attendanceCollectionListGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
  }
});
