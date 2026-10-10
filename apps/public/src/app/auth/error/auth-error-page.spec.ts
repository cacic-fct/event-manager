import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RESPONSE_INIT } from '@angular/core';
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
  let response: ResponseInit;

  beforeEach(async () => {
    response = { headers: { 'X-Request-Id': 'test-request' } };
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
        { provide: RESPONSE_INIT, useValue: response },
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

  it('renders the login-expired recovery copy and tucks fixed details in a disclosure', async () => {
    const fixture = createFixture();

    expect(text(fixture)).toContain('O tempo de login expirou.');
    expect(text(fixture)).toContain('Entre novamente para continuar.');
    expect(text(fixture)).toContain('Entrar com o Google');
    expect(text(fixture)).toContain('Detalhes técnicos');
    expect(text(fixture)).not.toContain('©');
  });

  it('starts login again without returning to the error page', async () => {
    const fixture = createFixture();

    clickButton(fixture, 'Entrar com o Google');

    expect(auth.login).toHaveBeenCalledWith({ returnTo: '/calendar' });
  });

  it('uses a safe query return path when provided', async () => {
    queryParamMap.next(convertToParamMap({ returnTo: '/profile', raw: '{"message":"expired"}' }));
    const fixture = createFixture();

    clickButton(fixture, 'Entrar com o Google');

    expect(auth.login).toHaveBeenCalledWith({ returnTo: '/profile' });
  });

  it('rejects external return paths from query params', async () => {
    queryParamMap.next(convertToParamMap({ returnTo: '//evil.example', raw: '{"message":"expired"}' }));
    const fixture = createFixture();

    clickButton(fixture, 'Entrar com o Google');

    expect(auth.login).toHaveBeenCalledWith({ returnTo: '/calendar' });
  });

  it('ignores text query params and uses the fixed login-expired copy', async () => {
    queryParamMap.next(
      convertToParamMap({
        reason: 'login-expired',
        title: '<img src=x onerror=alert(1)>',
        description: '<script>alert(1)</script>',
        actionLabel: '<svg onload=alert(1)>Entrar</svg>',
        raw: '{"message":"</code><img src=x onerror=alert(1)>"}',
      }),
    );

    const fixture = createFixture();
    const title = fixture.nativeElement.querySelector('h1') as HTMLElement;
    const description = fixture.nativeElement.querySelector('.auth-error-copy p') as HTMLElement;
    const technicalDetails = fixture.nativeElement.querySelector('pre code') as HTMLElement;

    expect(title.textContent).toBe('O tempo de login expirou.');
    expect(title.innerHTML).not.toContain('&lt;img');
    expect(title.querySelector('img')).toBeNull();
    expect(description.textContent).toBe('Entre novamente para continuar.');
    expect(description.querySelector('script')).toBeNull();
    expect(technicalDetails.textContent).toContain('Invalid authorization state.');
    expect(technicalDetails.textContent).not.toContain('onerror=alert(1)');
    expect(technicalDetails.querySelector('img')).toBeNull();
  });

  it('uses fixed server-error copy for the server-error reason', async () => {
    queryParamMap.next(convertToParamMap({ reason: 'server-error' }));
    const fixture = createFixture();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('Ocorreu um erro.');
    expect(text(fixture)).toContain('Tente novamente mais tarde');
    expect(text(fixture)).not.toContain('O tempo de login expirou.');
  });

  it.each([
    ['login-expired', 400],
    ['server-error', 500],
  ])('returns the appropriate SSR status and headers for %s', (reason, status) => {
    queryParamMap.next(convertToParamMap({ reason }));
    createFixture();

    expect(response.status).toBe(status);
    const headers = new Headers(response.headers);
    expect(headers.get('Cache-Control')).toBe('no-store, max-age=0');
    expect(headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(headers.get('X-Request-Id')).toBe('test-request');
  });

  it('rejects backslashes in return paths', () => {
    queryParamMap.next(convertToParamMap({ returnTo: '/\\evil.example' }));
    const fixture = createFixture();
    clickButton(fixture, 'Entrar com o Google');
    expect(auth.login).toHaveBeenCalledWith({ returnTo: '/calendar' });
  });

  it('explains a rejected clipboard permission without failing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    await createFixture().componentInstance.copyRawError();
    expect(snackBar.open).toHaveBeenCalledWith('Não foi possível copiar os detalhes.', 'OK', { duration: 3000 });
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

  it('switches the CACiC logo to the light class when the system color scheme is dark', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });

    const fixture = createFixture();
    const logo = fixture.nativeElement.querySelector('lib-cacic-logo') as HTMLElement | null;

    expect(logo?.classList.contains('logo-bark-mode')).toBe(true);
    expect(logo?.classList.contains('logo-light-mode')).toBe(false);
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
