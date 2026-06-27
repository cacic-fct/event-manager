import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, ServiceWorkerService } from '@cacic-fct/shared-angular';
import { vi } from 'vitest';
import { Preferences } from './preferences';

describe('Preferences', () => {
  let fixture: ComponentFixture<Preferences>;
  let authState: ReturnType<typeof signal<boolean>>;
  let authService: {
    isAuthenticated: ReturnType<typeof signal<boolean>>;
    logout: ReturnType<typeof vi.fn>;
  };
  let serviceWorkerService: {
    hasServiceWorker: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    authState = signal(false);
    authService = {
      isAuthenticated: authState,
      logout: vi.fn(),
    };
    serviceWorkerService = {
      hasServiceWorker: vi.fn(() => true),
    };

    await TestBed.configureTestingModule({
      imports: [Preferences],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: ServiceWorkerService, useValue: serviceWorkerService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Preferences);
  });

  it('keeps general preferences visible for unauthenticated visitors', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Preferências');
    expect(fixture.nativeElement.textContent).toContain('Aplicativo');
    expect(fixture.nativeElement.textContent).toContain('Calendário');
    expect(fixture.nativeElement.textContent).toContain('Service Worker');
    expect(fixture.nativeElement.textContent).toContain('Operacional');
    expect(fixture.nativeElement.textContent).not.toContain('Conta');
    expect(fixture.nativeElement.textContent).not.toContain('Editar informações da conta');
    expect(fixture.nativeElement.textContent).not.toContain('Sair da conta');
  });

  it('links application preferences to preference subroutes', () => {
    fixture.detectChanges();

    const links = Array.from(fixture.nativeElement.querySelectorAll('a')).map((link) =>
      (link as HTMLAnchorElement).getAttribute('href'),
    );

    expect(links).toContain('/preferences/calendar');
    expect(links).toContain('/preferences/service-worker');
    expect(links).not.toContain('/about/service-worker');
  });

  it('shows account actions only to logged in users', () => {
    authState.set(true);

    fixture.detectChanges();

    const accountLink: HTMLAnchorElement | null = fixture.nativeElement.querySelector(
      'a[href="https://account.cacic.dev.br/app/"]',
    );

    expect(fixture.nativeElement.textContent).toContain('Conta');
    expect(accountLink?.textContent).toContain('Editar informações da conta');
    expect(fixture.nativeElement.textContent).toContain('Sair da conta');
  });

  it('logs out from the account preferences action', () => {
    authState.set(true);
    fixture.detectChanges();

    const logoutButton = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('[role="button"]')).find((button) =>
      button.textContent?.includes('Sair da conta'),
    );

    expect(logoutButton).toBeDefined();

    logoutButton?.click();

    expect(authService.logout).toHaveBeenCalledTimes(1);
  });
});
