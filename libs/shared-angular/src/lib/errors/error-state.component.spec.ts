import '@angular/compiler';
import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { readFile } from 'node:fs/promises';
import { ErrorStateComponent } from './error-state.component';

describe('ErrorStateComponent', () => {
  beforeAll(async () => {
    TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
    await resolveComponentResources((url) => {
      const componentRelativeUrl = url.endsWith('cacic-logo.component.html')
        ? '../cacic-logo/cacic-logo.component.html'
        : url.endsWith('cacic-logo.component.scss')
          ? '../cacic-logo/cacic-logo.component.scss'
          : url;
      return readFile(new URL(componentRelativeUrl, import.meta.url), 'utf8');
    });
  });

  afterAll(() => TestBed.resetTestEnvironment());
  afterEach(() => TestBed.resetTestingModule());

  it.each([
    [403, 'Você não tem acesso a esta página.'],
    [404, 'Página não encontrada.'],
    [500, 'Não foi possível abrir esta página.'],
    [503, 'O serviço está indisponível no momento.'],
  ] as const)('renders the Portuguese default copy for status %i', async (status, title) => {
    const fixture = await configure();
    Object.assign(fixture.componentInstance, { status: () => status });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain(title);
    expect(fixture.nativeElement.querySelector('.status-code')?.textContent).toContain(`Erro ${status}`);
    expect(fixture.nativeElement.querySelector('pre code')?.textContent).toContain(`"statusCode": ${status}`);

    fixture.destroy();
  });

  it('uses explicitly curated copy and diagnostics when supplied', async () => {
    const fixture = await configure();
    Object.assign(fixture.componentInstance, {
      status: () => 503,
      title: () => 'Conexão temporariamente indisponível.',
      description: () => 'Tente novamente em alguns minutos.',
      technicalDetails: () => 'Código interno: AUTH-503',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Conexão temporariamente indisponível.');
    expect(fixture.nativeElement.querySelector('.error-copy p')?.textContent).toContain(
      'Tente novamente em alguns minutos.',
    );
    expect(fixture.nativeElement.querySelector('pre code')?.textContent).toContain('Código interno: AUTH-503');

    fixture.destroy();
  });

  async function configure(): Promise<ComponentFixture<ErrorStateComponent>> {
    TestBed.configureTestingModule({
      imports: [ErrorStateComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    await TestBed.compileComponents();
    return TestBed.createComponent(ErrorStateComponent);
  }
});
