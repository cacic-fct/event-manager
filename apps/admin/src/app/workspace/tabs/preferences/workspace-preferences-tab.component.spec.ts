import { PLATFORM_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AuthService } from '@cacic-fct/shared-angular';
import { EventManagerKeycloakRole } from '@cacic-fct/shared-permissions';
import { of, throwError } from 'rxjs';
import {
  AdminCalendarFeedSettingsApiService,
  CurrentUserAdminCalendarFeedSettings,
  SuperAdminCalendarFeedSettings,
} from '../../../graphql/admin-calendar-feed-settings-api.service';
import { WorkspacePreferencesTabComponent } from './workspace-preferences-tab.component';

type TestComponent = {
  disabledReasonMessage: (settings: CurrentUserAdminCalendarFeedSettings) => string | null;
  isRotatingSuperAdmin: () => boolean;
  isSuperAdmin: () => boolean;
  personalFeedUrl: () => string | null;
  rotateSuperAdminKey: () => Promise<void>;
  setPersonalEnabled: (change: { checked: boolean; source: { checked: boolean } }) => void;
  superAdminFeedUrl: () => string | null;
};

describe('WorkspacePreferencesTabComponent', () => {
  const roles = signal<string[]>([]);
  let api: {
    getCurrentUserAdminSettings: ReturnType<typeof vi.fn>;
    setCurrentUserAdminEnabled: ReturnType<typeof vi.fn>;
    rotateCurrentUserAdminKey: ReturnType<typeof vi.fn>;
    getSuperAdminSettings: ReturnType<typeof vi.fn>;
    rotateSuperAdminKey: ReturnType<typeof vi.fn>;
  };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    roles.set([]);
    api = {
      getCurrentUserAdminSettings: vi.fn().mockReturnValue(of(adminSettingsFixture())),
      setCurrentUserAdminEnabled: vi.fn().mockReturnValue(of(adminSettingsFixture())),
      rotateCurrentUserAdminKey: vi.fn().mockReturnValue(of(adminSettingsFixture())),
      getSuperAdminSettings: vi.fn().mockReturnValue(of(superAdminSettingsFixture())),
      rotateSuperAdminKey: vi.fn().mockReturnValue(of(superAdminSettingsFixture({ feedPath: '/api/calendar/admin/super-admin/rotated.ics' }))),
    };
    dialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(true),
      }),
    };
    snackBar = {
      open: vi.fn(),
    };

    const testingModule = TestBed.configureTestingModule({
      imports: [WorkspacePreferencesTabComponent],
      providers: [
        provideNoopAnimations(),
        { provide: AdminCalendarFeedSettingsApiService, useValue: api },
        { provide: AuthService, useValue: { roles } },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    TestBed.overrideProvider(MatDialog, { useValue: dialog });
    TestBed.overrideProvider(MatSnackBar, { useValue: snackBar });

    await testingModule.compileComponents();
  });

  it('loads the personal admin feed for non-super-admin users', async () => {
    roles.set(['admin']);
    const { component } = await createComponent();

    expect(api.getCurrentUserAdminSettings).toHaveBeenCalledTimes(1);
    expect(api.getSuperAdminSettings).not.toHaveBeenCalled();
    expect(component.isSuperAdmin()).toBe(false);
    expect(component.personalFeedUrl()).toBe(
      new URL('/api/calendar/admin/feeds/admin-key.ics', document.baseURI).toString(),
    );
    expect(
      component.disabledReasonMessage({
        ...adminSettingsFixture(),
        disabledReason: 'NO_CURRENT_ADMIN_TARGETS',
      }),
    ).toContain('não havia eventos');
  });

  it('hides the personal admin feed URL while the feed is disabled', async () => {
    roles.set(['admin']);
    api.getCurrentUserAdminSettings.mockReturnValueOnce(
      of(
        adminSettingsFixture({
          enabled: false,
          feedPath: '/api/calendar/admin/feeds/admin-key.ics',
        }),
      ),
    );
    const { component } = await createComponent();

    expect(component.personalFeedUrl()).toBeNull();
  });

  it('loads only the shared feed for super-admin users', async () => {
    roles.set([EventManagerKeycloakRole.SuperAdmin]);
    const { component } = await createComponent();

    expect(api.getCurrentUserAdminSettings).not.toHaveBeenCalled();
    expect(api.getSuperAdminSettings).toHaveBeenCalledTimes(1);
    expect(component.isSuperAdmin()).toBe(true);
    expect(component.superAdminFeedUrl()).toBe(
      new URL('/api/calendar/admin/super-admin/super-key.ics', document.baseURI).toString(),
    );
  });

  it('reverts the personal feed toggle and shows the backend error when enablement fails', async () => {
    roles.set(['admin']);
    api.setCurrentUserAdminEnabled.mockReturnValueOnce(throwError(() => new Error('Sem eventos atuais.')));
    const { component } = await createComponent();
    const source = { checked: true };

    component.setPersonalEnabled({ checked: true, source });

    expect(api.setCurrentUserAdminEnabled).toHaveBeenCalledWith(true);
    expect(source.checked).toBe(false);
    expect(snackBar.open).toHaveBeenCalledWith('Sem eventos atuais.', 'OK', { duration: 5000 });
  });

  it('confirms shared super-admin key rotation before reloading', async () => {
    roles.set([EventManagerKeycloakRole.SuperAdmin]);
    const { component } = await createComponent();

    await component.rotateSuperAdminKey();

    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Invalidar feed de todos os super-admins',
          confirmLabel: 'Invalidar para todos',
        }),
      }),
    );
    expect(api.rotateSuperAdminKey).toHaveBeenCalledTimes(1);
    expect(snackBar.open).toHaveBeenCalledWith('Chave compartilhada dos super-admins rotacionada.', 'OK', {
      duration: 3500,
    });
    expect(component.isRotatingSuperAdmin()).toBe(false);
  });

  async function createComponent(): Promise<{
    component: TestComponent;
    fixture: ComponentFixture<WorkspacePreferencesTabComponent>;
  }> {
    const fixture = TestBed.createComponent(WorkspacePreferencesTabComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    return {
      component: fixture.componentInstance as unknown as TestComponent,
      fixture,
    };
  }
});

function adminSettingsFixture(overrides: Partial<CurrentUserAdminCalendarFeedSettings> = {}): CurrentUserAdminCalendarFeedSettings {
  return {
    enabled: true,
    feedPath: '/api/calendar/admin/feeds/admin-key.ics',
    disabledAt: null,
    disabledReason: null,
    ...overrides,
  };
}

function superAdminSettingsFixture(overrides: Partial<SuperAdminCalendarFeedSettings> = {}): SuperAdminCalendarFeedSettings {
  return {
    enabled: true,
    feedPath: '/api/calendar/admin/super-admin/super-key.ics',
    lastFetchedAt: '2026-06-23T10:00:00.000Z',
    rotatedAt: '2026-06-22T12:00:00.000Z',
    updatedAt: '2026-06-23T12:00:00.000Z',
    ...overrides,
  };
}
