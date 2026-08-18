import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { signal } from '@angular/core';
import { PublicFeatureFlagService } from '../../feature-flags/public-feature-flag.service';
import { ToolbarLayoutComponent } from './layout';
import { MyDayStore } from '../../my-day/my-day.store';

describe('ToolbarLayoutComponent', () => {
  let fixture: ComponentFixture<ToolbarLayoutComponent>;
  let authState: ReturnType<typeof signal<boolean>>;
  let flags: Record<string, boolean>;
  let myDayAvailable: ReturnType<typeof signal<boolean | null>>;

  beforeEach(async () => {
    TestBed.resetTestingModule();

    authState = signal(true);
    flags = {
      calendarTabEnabled: true,
      majorEventTabEnabled: true,
      notificationsTabEnabled: true,
      myDayTabEnabled: true,
    };
    myDayAvailable = signal(true);

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
        {
          provide: MyDayStore,
          useValue: { hasAvailableContent: myDayAvailable },
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
      '/my-day',
      '/notifications',
      '/menu',
    ]);
  });

  it('keeps My Day third and hides it when no associated content exists', () => {
    expect(fixture.componentInstance.items()[2]).toMatchObject({
      route: '/my-day',
      icon: 'auto_awesome',
      hidden: false,
    });

    myDayAvailable.set(false);

    expect(fixture.componentInstance.items()[2].hidden).toBe(true);
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
