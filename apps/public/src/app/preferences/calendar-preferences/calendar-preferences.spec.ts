import { PLATFORM_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { CalendarPreferencesStorageService } from '@cacic-fct/offline-public-data-access';
import { AuthService } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';
import { CalendarPreferencesApiService, CurrentUserCalendarFeedSettings } from './calendar-preferences-api.service';
import { CalendarPreferences } from './calendar-preferences';

type TestComponent = {
  feedUrl: () => string | null;
  setDefaultItemView: (change: { value: unknown }) => void;
  setEnabled: (change: { checked: boolean; source: { checked: boolean } }) => Promise<void>;
};

describe('CalendarPreferences', () => {
  let api: {
    getSettings: ReturnType<typeof vi.fn>;
    setEnabled: ReturnType<typeof vi.fn>;
    rotateKey: ReturnType<typeof vi.fn>;
  };
  let authState: ReturnType<typeof signal<boolean>>;
  let authService: { isAuthenticated: ReturnType<typeof signal<boolean>> };
  let calendarPreferences: {
    watchDefaultItemView: ReturnType<typeof vi.fn>;
    setDefaultItemView: ReturnType<typeof vi.fn>;
  };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    api = {
      getSettings: vi.fn().mockReturnValue(of(settingsFixture())),
      setEnabled: vi.fn().mockReturnValue(of(settingsFixture())),
      rotateKey: vi.fn().mockReturnValue(of(settingsFixture({ enabled: false, feedPath: null }))),
    };
    authState = signal(true);
    authService = {
      isAuthenticated: authState,
    };
    calendarPreferences = {
      watchDefaultItemView: vi.fn().mockReturnValue(of('automatic')),
      setDefaultItemView: vi.fn().mockResolvedValue(undefined),
    };
    dialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of('keep'),
      }),
    };
    snackBar = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CalendarPreferences],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: CalendarPreferencesApiService, useValue: api },
        { provide: AuthService, useValue: authService },
        { provide: CalendarPreferencesStorageService, useValue: calendarPreferences },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    })
      .overrideProvider(MatDialog, { useValue: dialog })
      .overrideProvider(MatSnackBar, { useValue: snackBar })
      .compileComponents();
  });

  it('loads and resolves the feed URL only while the feed is enabled', async () => {
    const { component } = await createComponent();

    expect(api.getSettings).toHaveBeenCalledTimes(1);
    expect(component.feedUrl()).toBe(new URL('/api/calendar/feeds/user-key.ics', document.baseURI).toString());
  });

  it('persists an explicit default item view preference', async () => {
    const { component } = await createComponent();

    component.setDefaultItemView({ value: 'week' });

    expect(calendarPreferences.setDefaultItemView).toHaveBeenCalledWith('week');
  });

  it('does not persist the automatic default item view yet', async () => {
    const { component } = await createComponent();

    component.setDefaultItemView({ value: 'automatic' });

    expect(calendarPreferences.setDefaultItemView).not.toHaveBeenCalled();
  });

  it('keeps calendar feed settings hidden for unauthenticated visitors', async () => {
    authState.set(false);

    await createComponent();

    expect(api.getSettings).not.toHaveBeenCalled();
  });

  it('enables a first-time feed without asking for key rotation', async () => {
    api.getSettings.mockReturnValueOnce(of(settingsFixture({ enabled: false, feedPath: null, disabledAt: null })));
    const { component } = await createComponent();
    const source = { checked: true };

    await component.setEnabled({ checked: true, source });

    expect(dialog.open).not.toHaveBeenCalled();
    expect(api.rotateKey).not.toHaveBeenCalled();
    expect(api.setEnabled).toHaveBeenCalledWith(true);
    expect(source.checked).toBe(true);
  });

  it('asks before re-enabling and keeps the current link when selected', async () => {
    api.getSettings.mockReturnValueOnce(of(disabledSettingsFixture()));
    const { component } = await createComponent();

    await component.setEnabled({ checked: true, source: { checked: true } });

    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({ feedName: 'o feed do calendário' }),
      }),
    );
    expect(api.rotateKey).not.toHaveBeenCalled();
    expect(api.setEnabled).toHaveBeenCalledWith(true);
  });

  it('rotates the key before re-enabling when selected', async () => {
    api.getSettings.mockReturnValueOnce(of(disabledSettingsFixture()));
    dialog.open.mockReturnValueOnce({
      afterClosed: () => of('rotate'),
    });
    const { component } = await createComponent();

    await component.setEnabled({ checked: true, source: { checked: true } });

    expect(api.rotateKey).toHaveBeenCalledTimes(1);
    expect(api.setEnabled).toHaveBeenCalledWith(true);
  });

  it('reverts the toggle when the re-enable dialog is canceled', async () => {
    api.getSettings.mockReturnValueOnce(of(disabledSettingsFixture()));
    dialog.open.mockReturnValueOnce({
      afterClosed: () => of(false),
    });
    const { component } = await createComponent();
    const source = { checked: true };

    await component.setEnabled({ checked: true, source });

    expect(source.checked).toBe(false);
    expect(api.rotateKey).not.toHaveBeenCalled();
    expect(api.setEnabled).not.toHaveBeenCalled();
  });

  async function createComponent(): Promise<{
    component: TestComponent;
    fixture: ComponentFixture<CalendarPreferences>;
  }> {
    const fixture = TestBed.createComponent(CalendarPreferences);
    fixture.detectChanges();
    await fixture.whenStable();

    return {
      component: fixture.componentInstance as unknown as TestComponent,
      fixture,
    };
  }
});

function disabledSettingsFixture(): CurrentUserCalendarFeedSettings {
  return settingsFixture({
    enabled: false,
    feedPath: null,
    disabledAt: '2026-06-23T12:00:00.000Z',
    disabledReason: null,
  });
}

function settingsFixture(overrides: Partial<CurrentUserCalendarFeedSettings> = {}): CurrentUserCalendarFeedSettings {
  return {
    enabled: true,
    feedPath: '/api/calendar/feeds/user-key.ics',
    disabledAt: null,
    disabledReason: null,
    ...overrides,
  };
}
