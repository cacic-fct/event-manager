import '../testing/observer-mocks';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Params, Router, convertToParamMap } from '@angular/router';
import type { PublicCertificateValidation } from '@cacic-fct/event-manager-public-contracts';
import { AuthService, CacicAnalyticsService } from '@cacic-fct/shared-angular';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, of } from 'rxjs';
import { CertificateFileDownloadService } from '../shared/certificate-file-download.service';
import { CertificateValidation } from './certificate-validation';
import { CertificateValidationApiService } from './certificate-validation-api.service';

describe('CertificateValidation', () => {
  it('waits for a Turnstile token before validating a certificate from a link', async () => {
    const { api, component } = await createFixture({ routeParams: { certificateId: 'certificate-1' } });

    expect(component.state()).toEqual({
      status: 'challenge',
      certificateId: 'certificate-1',
      source: 'link',
    });
    expect(api.validateCertificate).not.toHaveBeenCalled();

    component.onTurnstileTokenChange('turnstile-token');

    expect(api.validateCertificate).toHaveBeenCalledWith('certificate-1', 'turnstile-token');
    expect(component.state()).toEqual({
      status: 'ready',
      certificate: certificateFixture,
    });
  });

  it('makes the challenge state clear after QR-code scan submission', async () => {
    const { api, component, router } = await createFixture();

    component.validationForm.certificateId().value.set('scanned-certificate');
    component.submit('scan');

    expect(router.navigate).toHaveBeenCalledWith(['/validate'], {
      queryParams: { certificateId: 'scanned-certificate' },
    });
    expect(component.state()).toEqual({
      status: 'challenge',
      certificateId: 'scanned-certificate',
      source: 'scan',
    });
    expect(component.challengeMessage('scan')).toContain('Código escaneado');
    expect(api.validateCertificate).not.toHaveBeenCalled();

    component.onTurnstileTokenChange('scan-token');

    expect(api.validateCertificate).toHaveBeenCalledWith('scanned-certificate', 'scan-token');
  });

  it('keeps an invalid route certificate id as a signal-form validation error until the value changes', async () => {
    const { component } = await createFixture({ queryParams: { invalidId: 'missing-certificate' } });

    expect(component.validationForm.certificateId().value()).toBe('missing-certificate');
    expect(component.validationForm.certificateId().invalid()).toBe(true);
    expect(component.validationForm.certificateId().errors().some((error) => error.kind === 'notFound')).toBe(true);

    component.validationForm.certificateId().value.set('other-certificate');

    expect(component.validationForm.certificateId().invalid()).toBe(false);
  });

  it('submits manual certificate lookup through the native form submit event', async () => {
    const { component, fixture, router } = await createFixture();
    component.validationForm.certificateId().value.set('manual-certificate');
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form.lookup-form') as HTMLFormElement | null;
    expect(form).not.toBeNull();

    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    const wasNotCanceled = form?.dispatchEvent(submitEvent);

    expect(wasNotCanceled).toBe(false);
    expect(submitEvent.defaultPrevented).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith(['/validate'], {
      queryParams: { certificateId: 'manual-certificate' },
    });
  });
});

async function createFixture({
  routeParams = {},
  queryParams = {},
}: {
  routeParams?: Params;
  queryParams?: Params;
} = {}): Promise<{
  api: {
    validateCertificate: ReturnType<typeof vi.fn>;
    downloadCertificate: ReturnType<typeof vi.fn>;
  };
  component: CertificateValidation;
  fixture: ComponentFixture<CertificateValidation>;
  router: { navigate: ReturnType<typeof vi.fn>; url: string };
}> {
  const paramMap = new BehaviorSubject(convertToParamMap(routeParams));
  const queryParamMap = new BehaviorSubject(convertToParamMap(queryParams));
  const api = {
    validateCertificate: vi.fn(() => of(certificateFixture)),
    downloadCertificate: vi.fn(),
  };
  const router = {
    url: '/validate',
    navigate: vi.fn((_commands: unknown[], extras?: { queryParams?: Params }) => {
      queryParamMap.next(convertToParamMap(extras?.queryParams ?? {}));
      return Promise.resolve(true);
    }),
  };

  await TestBed.configureTestingModule({
    imports: [CertificateValidation],
    providers: [
      provideNoopAnimations(),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap,
          queryParamMap,
          snapshot: {
            paramMap: convertToParamMap(routeParams),
            queryParamMap: convertToParamMap(queryParams),
          },
        },
      },
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: signal(false),
        },
      },
      {
        provide: CacicAnalyticsService,
        useValue: {
          trackEvent: vi.fn(),
        },
      },
      {
        provide: CertificateValidationApiService,
        useValue: api,
      },
      {
        provide: CertificateFileDownloadService,
        useValue: {
          save: vi.fn(),
        },
      },
      {
        provide: MatDialog,
        useValue: {
          open: vi.fn(),
        },
      },
      {
        provide: Router,
        useValue: router,
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(CertificateValidation);

  return {
    api,
    component: fixture.componentInstance,
    fixture,
    router,
  };
}

const certificateFixture = {
  id: 'certificate-1',
  issuedAt: '2026-06-01T12:00:00.000Z',
  personName: 'Ada Lovelace',
  maskedIdentityDocument: null,
  scope: 'EVENT',
  certificateName: 'Certificado',
  targetName: 'Evento teste',
  targetEmoji: '🎓',
  totalCreditMinutes: 60,
  sections: [],
} satisfies PublicCertificateValidation;
