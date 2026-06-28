import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { Permission } from '@cacic-fct/shared-permissions';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { MenuComponent } from './menu.component';

describe('MenuComponent', () => {
  let component: MenuComponent;
  let fixture: ComponentFixture<MenuComponent>;
  let authService: AuthService;
  let httpTesting: HttpTestingController;
  let addEventListener: ReturnType<
    typeof vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>
  >;
  let removeEventListener: ReturnType<
    typeof vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>
  >;

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn(),
    });
  });

  beforeEach(async () => {
    addEventListener = vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>();
    removeEventListener = vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>();
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener,
      removeEventListener,
      dispatchEvent: vi.fn(),
    }));

    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({}),
            queryParamMap: of({}),
            snapshot: {
              paramMap: new Map(),
              queryParamMap: new Map(),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);

    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    httpTesting.verify();
    authService.clearSession();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps preferences visible without account actions in the menu header', () => {
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Preferências');
    expect(text).not.toContain('Editar informações da conta');
    expect(text).not.toContain('Sair da conta');
    expect(fixture.nativeElement.querySelector('a[href="https://account.cacic.dev.br/app/"]')).toBeNull();
  });

  it('shows the admin panel link for users with workspace entry permissions', async () => {
    authService.user.set({
      sub: 'admin-user',
      roles: ['access'],
      permissions: [],
      claims: {},
    });
    fixture.detectChanges();

    httpTesting.expectOne('/api/graphql').flush({
      data: {
        currentUserAttendanceCollectionEvents: [],
      },
    });
    httpTesting.expectOne('/api/auth/permissions/evaluate').flush({
      permissions: [Permission.Event.Read],
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const adminLink = fixture.nativeElement.querySelector('a[href="/admin"]');

    expect(fixture.nativeElement.textContent).toContain('Colaboração');
    expect(fixture.nativeElement.textContent).toContain('Painel administrativo');
    expect(adminLink).not.toBeNull();
  });

  it('should remove the color scheme listener on destroy', () => {
    const listener = addEventListener.mock.calls.find(([eventName]) => eventName === 'change')?.[1];

    expect(listener).toBeDefined();

    fixture.destroy();

    expect(removeEventListener).toHaveBeenCalledWith('change', listener);
  });
});
