import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { LoginPageComponent } from './login-page.component';

describe('LoginPageComponent', () => {
  let authService: {
    isAuthenticated: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    passwordLogin: ReturnType<typeof vi.fn>;
  };
  let fixture: ComponentFixture<LoginPageComponent>;
  let router: Router;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    authService = {
      isAuthenticated: vi.fn(() => false),
      login: vi.fn().mockResolvedValue(undefined),
      passwordLogin: vi.fn().mockResolvedValue(authenticatedUserFixture()),
    };

    await TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({
                returnTo: '/admin/events',
              }),
            },
          },
        },
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();
  });

  it('renders the development password form and SSO fallback', () => {
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Entre com e-mail e senha para acessar o painel.');
    expect(text).toContain('E-mail');
    expect(text).toContain('Senha');
    expect(text).toContain('Entrar com SSO');
  });

  it('submits credentials through the development password login flow', async () => {
    const component = fixture.componentInstance as unknown as {
      form: { setValue(value: { email: string; password: string }): void };
      onSubmit(): Promise<void>;
    };
    component.form.setValue({
      email: 'aluno@unesp.br',
      password: '1',
    });

    await component.onSubmit();

    expect(authService.passwordLogin).toHaveBeenCalledWith('aluno@unesp.br', '1');
    expect(navigateByUrl).toHaveBeenCalledWith('/admin/events');
  });

  it('keeps invalid password login failures on the local form', async () => {
    authService.passwordLogin.mockRejectedValueOnce(new Error('Invalid credentials'));
    const component = fixture.componentInstance as unknown as {
      form: { setValue(value: { email: string; password: string }): void };
      onSubmit(): Promise<void>;
    };
    component.form.setValue({
      email: 'aluno@unesp.br',
      password: 'wrong-password',
    });

    await component.onSubmit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('E-mail ou senha inválidos.');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('starts SSO with the preserved return path', async () => {
    const component = fixture.componentInstance as unknown as {
      onSsoClick(): Promise<void>;
    };

    await component.onSsoClick();

    expect(authService.login).toHaveBeenCalledWith({ returnTo: '/admin/events' });
  });
});

function authenticatedUserFixture() {
  return {
    realm_access: {
      roles: [],
    },
    sub: 'user-1',
    preferredUsername: 'aluno',
    email: 'aluno@unesp.br',
    roles: ['access'],
    permissions: [],
    oidcScopes: ['openid'],
    scopes: ['openid'],
    claims: {
      is_onboarded: true,
    },
  };
}
