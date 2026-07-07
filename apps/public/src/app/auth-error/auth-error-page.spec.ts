import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '@cacic-fct/shared-angular';
import { BehaviorSubject } from 'rxjs';
import { AuthErrorPage } from './auth-error-page';

describe('AuthErrorPage', () => {
  let queryParamMap: BehaviorSubject<ParamMap>;
  let auth: { login: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    queryParamMap = new BehaviorSubject(
      convertToParamMap({
        raw: JSON.stringify({
          message: 'Invalid authorization state.',
          error: 'Bad Request',
          statusCode: 400,
        }),
      }),
    );
    auth = {
      login: vi.fn().mockResolvedValue(undefined),
    };
    snackBar = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AuthErrorPage],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: auth,
        },
        {
          provide: MatSnackBar,
          useValue: snackBar,
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParamMap.asObservable(),
          },
        },
      ],
    })
      .overrideProvider(MatSnackBar, { useValue: snackBar })
      .overrideProvider(AuthService, { useValue: auth })
      .compileComponents();
  });

  it('renders the login-expired recovery copy and tucks raw details in a disclosure', async () => {
    const fixture = createFixture();

    expect(text(fixture)).toContain('O tempo de login expirou. Tente novamente');
    expect(text(fixture)).toContain('Tentar login novamente');
    expect(text(fixture)).toContain('Detalhes técnicos');
    expect(text(fixture)).not.toContain('©');
  });

  it('starts login again without returning to the error page', async () => {
    const fixture = createFixture();

    clickButton(fixture, 'Tentar login novamente');

    expect(auth.login).toHaveBeenCalledWith({ returnTo: '/calendar' });
  });

  it('uses a safe query return path when provided', async () => {
    queryParamMap.next(convertToParamMap({ returnTo: '/profile', raw: '{"message":"expired"}' }));
    const fixture = createFixture();

    clickButton(fixture, 'Tentar login novamente');

    expect(auth.login).toHaveBeenCalledWith({ returnTo: '/profile' });
  });

  it('rejects external return paths from query params', async () => {
    queryParamMap.next(convertToParamMap({ returnTo: '//evil.example', raw: '{"message":"expired"}' }));
    const fixture = createFixture();

    clickButton(fixture, 'Tentar login novamente');

    expect(auth.login).toHaveBeenCalledWith({ returnTo: '/calendar' });
  });

  it('copies raw technical details when the clipboard is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const fixture = createFixture();

    await fixture.componentInstance.copyRawError();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Invalid authorization state'));
    expect(snackBar.open).toHaveBeenCalledWith('Detalhes técnicos copiados.', 'OK', { duration: 3000 });
  });

  it('uses the dark-mode CACiC logo color when the system color scheme is dark', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    const fixture = createFixture();

    expect(fixture.componentInstance.logoFillColor()).toBe('#fff');
  });

  function createFixture(): ComponentFixture<AuthErrorPage> {
    const fixture = TestBed.createComponent(AuthErrorPage);
    fixture.detectChanges();
    return fixture;
  }
});

function text(fixture: ComponentFixture<unknown>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function clickButton(fixture: ComponentFixture<unknown>, label: string): void {
  const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
  const button = buttons.find((candidate) => candidate.textContent?.includes(label));
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  button.click();
}
