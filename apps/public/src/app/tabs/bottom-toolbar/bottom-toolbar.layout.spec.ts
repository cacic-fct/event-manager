import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { signal } from '@angular/core';
import { PublicFeatureFlagService } from '../../feature-flags/public-feature-flag.service';
import { ToolbarLayoutComponent } from './bottom-toolbar.layout';

describe('ToolbarLayoutComponent', () => {
  let fixture: ComponentFixture<ToolbarLayoutComponent>;
  let authState: ReturnType<typeof signal<boolean>>;
  let flags: Record<string, boolean>;

  beforeEach(async () => {
    authState = signal(true);
    flags = {
      calendarTabEnabled: true,
      majorEventTabEnabled: true,
      notificationsTabEnabled: true,
    };

    await TestBed.configureTestingModule({
      imports: [ToolbarLayoutComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: authState,
          },
        },
        {
          provide: PublicFeatureFlagService,
          useValue: {
            booleanValue: (key: string) => flags[key] ?? true,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ToolbarLayoutComponent);
  });

  it('shows enabled non-menu tabs', () => {
    const items = fixture.componentInstance.items();

    expect(items.filter((item) => !item.hidden).map((item) => item.route)).toEqual([
      '/calendar',
      '/major-event',
      '/notifications',
      '/menu',
    ]);
  });

  it('hides non-menu tabs disabled by feature flags', () => {
    flags['calendarTabEnabled'] = false;
    flags['notificationsTabEnabled'] = false;

    const items = fixture.componentInstance.items();

    expect(items.find((item) => item.route === '/calendar')?.hidden).toBe(true);
    expect(items.find((item) => item.route === '/notifications')?.hidden).toBe(true);
    expect(items.find((item) => item.route === '/menu')?.hidden).toBe(false);
  });

  it('allows Storybook overrides for tab flags', () => {
    fixture.componentRef.setInput('majorEventTabEnabledOverride', false);

    const items = fixture.componentInstance.items();

    expect(items.find((item) => item.route === '/major-event')?.hidden).toBe(true);
  });
});
