import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { AdminCalendarFeedSettingsApiService } from './admin-calendar-feed-settings-api.service';

describe('AdminCalendarFeedSettingsApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: AdminCalendarFeedSettingsApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('CurrentUserAdminCalendarFeedSettings')) {
          return of({
            currentUserAdminCalendarFeedSettings: adminSettingsFixture(),
          });
        }
        if (query.includes('SetCurrentUserAdminCalendarFeedEnabled')) {
          return of({
            setCurrentUserAdminCalendarFeedEnabled: adminSettingsFixture({ enabled: false }),
          });
        }
        if (query.includes('RotateCurrentUserAdminCalendarFeedKey')) {
          return of({
            rotateCurrentUserAdminCalendarFeedKey: adminSettingsFixture({ feedPath: '/api/calendar/admin/feeds/rotated.ics' }),
          });
        }
        if (query.includes('SuperAdminCalendarFeedSettings')) {
          return of({
            superAdminCalendarFeedSettings: superAdminSettingsFixture(),
          });
        }
        return of({
          rotateSuperAdminCalendarFeedKey: superAdminSettingsFixture({
            feedPath: '/api/calendar/admin/super-admin/rotated.ics',
          }),
        });
      }),
    };

    TestBed.configureTestingModule({
      providers: [AdminCalendarFeedSettingsApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(AdminCalendarFeedSettingsApiService);
  });

  it('maps current admin feed query and mutations from GraphQL response fields', async () => {
    await expect(firstValueFrom(service.getCurrentUserAdminSettings())).resolves.toEqual(adminSettingsFixture());
    await expect(firstValueFrom(service.setCurrentUserAdminEnabled(false))).resolves.toEqual(
      adminSettingsFixture({ enabled: false }),
    );
    await expect(firstValueFrom(service.rotateCurrentUserAdminKey())).resolves.toEqual(
      adminSettingsFixture({ feedPath: '/api/calendar/admin/feeds/rotated.ics' }),
    );

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('currentUserAdminCalendarFeedSettings'),
    );
    expect(graphqlHttp.request.mock.calls[0][0]).not.toContain('lastCheckedAt');
    expect(graphqlHttp.request.mock.calls[0][0]).not.toContain('rotatedAt');
    expect(graphqlHttp.request.mock.calls[0][0]).toContain('disabledReason');
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('setCurrentUserAdminCalendarFeedEnabled'),
      { enabled: false },
    );
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('rotateCurrentUserAdminCalendarFeedKey'),
    );
  });

  it('maps shared super-admin feed query and rotation mutation', async () => {
    await expect(firstValueFrom(service.getSuperAdminSettings())).resolves.toEqual(superAdminSettingsFixture());
    await expect(firstValueFrom(service.rotateSuperAdminKey())).resolves.toEqual(
      superAdminSettingsFixture({ feedPath: '/api/calendar/admin/super-admin/rotated.ics' }),
    );

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('superAdminCalendarFeedSettings'));
    expect(graphqlHttp.request.mock.calls[0][0]).toContain('rotatedAt');
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('rotateSuperAdminCalendarFeedKey'),
    );
  });
});

function adminSettingsFixture(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    feedPath: '/api/calendar/admin/feeds/admin-key.ics',
    disabledAt: null,
    disabledReason: null,
    ...overrides,
  };
}

function superAdminSettingsFixture(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    feedPath: '/api/calendar/admin/super-admin/super-key.ics',
    lastFetchedAt: '2026-06-23T10:00:00.000Z',
    rotatedAt: '2026-06-22T12:00:00.000Z',
    updatedAt: '2026-06-23T12:00:00.000Z',
    ...overrides,
  };
}
