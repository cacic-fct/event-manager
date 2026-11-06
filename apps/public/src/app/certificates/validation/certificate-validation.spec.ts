import '../../testing/observer-mocks';
import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, DestroyRef, signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Params, RouteReuseStrategy, Router, convertToParamMap, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type {
  PublicCertificateValidation,
  PublicCertificateVerification,
} from '@cacic-fct/event-manager-public-contracts';
import { AuthService } from '@cacic-fct/shared-angular';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { CertificateFileDownloadService } from '../../shared/certificate-file-download.service';
import { CertificateValidation } from './certificate-validation';
import { CertificateValidationApiService } from './certificate-validation-api.service';
import { AppRouteReuseStrategy } from '../../layout/tab-reuse.strategy';
import { appRoutes } from '../../app.routes';

describe('CertificateValidation', () => {
  it('shows only a lookup form before validation', async () => {
    const { fixture } = await createFixture();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.lookup-form')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.certificate-section')).toBeNull();
    expect(fixture.nativeElement.querySelector('.preview-section')).toBeNull();
  });

  it('keeps the secondary lookup above the result and focuses it on request', async () => {
    const { component, fixture } = await createFixture({ queryParams: { certificateId: 'certificate-1' } });
    component.onTurnstileTokenChange('token');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#lookup-section').hidden).toBe(true);
    const button = fixture.nativeElement.querySelector('.lookup-shortcut button') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#lookup-section').hidden).toBe(false);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input'));
    expect(fixture.nativeElement.textContent).not.toContain('Verificação por');
    expect(fixture.nativeElement.textContent).not.toContain(' · ');
  });

  it('restores focus after a manual lookup hides its focused input', async () => {
    const { api, component, fixture } = await createFixture({ queryParams: { certificateId: 'certificate-1' } });
    const response = new Subject<PublicCertificateVerification>();
    api.validateCertificate.mockReturnValue(response);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.focus();
    component.onTurnstileTokenChange('token');
    response.next(verificationFixture);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#lookup-section').hidden).toBe(true);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.lookup-shortcut button'));
  });

  it.each(['request', 'poll', 'image'] as const)('cancels pending preview %s work on collapse', async (stage) => {
    const { api, component, fixture } = await createFixture({ queryParams: { certificateId: 'certificate-1' } });
    component.onTurnstileTokenChange('token');
    const request = new Subject<{ imagePath: string | null }>();
    const image = new Subject<HttpResponse<Blob>>();
    api.requestPreview.mockReturnValue(request);
    api.previewCertificate.mockReturnValue(image);
    vi.useFakeTimers();
    try {
      component.togglePreview(certificateFixture);
      if (stage !== 'request') {
        request.next({ imagePath: stage === 'poll' ? null : '/api/certificates/validate/certificate-1/preview' });
        request.complete();
      }
      component.togglePreview(certificateFixture);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(component.previewState()).toBe('available');
      expect(component.previewExpanded()).toBe(false);
      expect(request.observed).toBe(false);
      expect(image.observed).toBe(false);
      expect(api.requestPreview).toHaveBeenCalledTimes(1);
      fixture.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires fresh verification after a brief navigation cache expires', async () => {
    const { api, component, fixture } = await createFixture({ queryParams: { certificateId: 'certificate-1' } });
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      component.onTurnstileTokenChange('token');
      fixture.destroy();
      clock.mockReturnValue(now + 5000);
      const returned = TestBed.createComponent(CertificateValidation).componentInstance;
      expect(returned.state().status).toBe('challenge');
      api.validateCertificate.mockReturnValue(
        of({ certificate: null, revokedAt: new Date(now).toISOString(), previewToken: null }),
      );
      returned.onTurnstileTokenChange('fresh-token');
      expect(returned.state().status).toBe('revoked');
      expect(api.validateCertificate).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });

  it('shows revocation separately without recipient information or downloads', async () => {
    const { api, component, fixture } = await createFixture({ queryParams: { certificateId: 'revoked' } });
    api.validateCertificate.mockReturnValue(
      of({ certificate: null, revokedAt: new Date().toISOString(), previewToken: null }),
    );
    component.onTurnstileTokenChange('token');
    fixture.detectChanges();
    expect(component.state().status).toBe('revoked');
    expect(fixture.nativeElement.textContent).toContain('Certificado revogado');
    expect(fixture.nativeElement.textContent).not.toContain('Ada Lovelace');
    expect(fixture.nativeElement.querySelector('.actions')).toBeNull();
  });

  it('keeps temporary verification failures distinct from invalid certificates', async () => {
    const { api, component, fixture } = await createFixture({ queryParams: { certificateId: 'certificate-1' } });
    api.validateCertificate.mockReturnValue(throwError(() => new Error('Unavailable')));
    component.onTurnstileTokenChange('token');
    fixture.detectChanges();
    expect(component.state().status).toBe('error');
    expect(fixture.nativeElement.textContent).toContain('Não foi possível verificar agora');
    expect(fixture.nativeElement.textContent).not.toContain('Certificado não encontrado');
  });

  it.each(['rate limit', 'unavailable'])(
    'silently removes the preview after %s while keeping validation',
    async (failure) => {
      const { api, component, fixture } = await createFixture({ queryParams: { certificateId: 'certificate-1' } });
      component.onTurnstileTokenChange('token');
      expect(api.requestPreview).not.toHaveBeenCalled();
      api.requestPreview.mockReturnValue(failure === 'rate limit' ? throwError(() => new Error('429')) : of(null));
      component.togglePreview(certificateFixture);
      fixture.detectChanges();
      expect(component.state().status).toBe('ready');
      expect(component.previewState()).toBe('hidden');
      expect(fixture.nativeElement.querySelector('.preview-section')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Certificado válido');
    },
  );

  it('moves keyboard focus to the PDF action when the preview disappears', async () => {
    const { api, component, fixture } = await createFixture({ queryParams: { certificateId: 'certificate-1' } });
    component.onTurnstileTokenChange('token');
    const response = new Subject<null>();
    api.requestPreview.mockReturnValue(response);
    fixture.detectChanges();
    const previewButton = fixture.nativeElement.querySelector('.preview-section button') as HTMLButtonElement;
    previewButton.focus();
    previewButton.click();
    fixture.detectChanges();
    response.next(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.preview-section')).toBeNull();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.actions button'));
  });

  it('loads an on-demand AVIF and releases its object URL when changing certificates', async () => {
    const { api, component, router } = await createFixture({ queryParams: { certificateId: 'certificate-1' } });
    const createObjectURL = vi.fn(() => 'blob:certificate-preview');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = createObjectURL;
        static override revokeObjectURL = revokeObjectURL;
      },
    );
    try {
      component.onTurnstileTokenChange('token');
      api.requestPreview.mockReturnValue(of({ imagePath: '/api/certificates/validate/certificate-1/preview' }));
      api.previewCertificate.mockReturnValue(
        of(new HttpResponse({ body: new Blob(['image'], { type: 'image/avif' }), status: 200 })),
      );
      component.togglePreview(certificateFixture);
      expect(api.requestPreview).toHaveBeenCalledWith('certificate-1', 'preview-token');
      expect(api.previewCertificate).toHaveBeenCalledWith(
        '/api/certificates/validate/certificate-1/preview',
        'preview-token',
      );
      expect(component.previewUrl()).toBe('blob:certificate-preview');
      await router.navigate(['/validate'], { queryParams: { certificateId: 'certificate-2' } });
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:certificate-preview');
      expect(component.previewUrl()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('bounds pending preview polling and silently removes an exhausted preview', async () => {
    const { api, component, fixture } = await createFixture({ queryParams: { certificateId: 'certificate-1' } });
    component.onTurnstileTokenChange('token');
    api.requestPreview.mockReturnValue(of({ imagePath: null }));
    vi.useFakeTimers();
    try {
      component.togglePreview(certificateFixture);
      await vi.advanceTimersByTimeAsync(20000);
      expect(api.requestPreview).toHaveBeenCalledTimes(10);
      expect(component.previewState()).toBe('hidden');
      expect(component.state().status).toBe('ready');
      fixture.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels an unfinished validation when the page is destroyed', async () => {
    const { api, component, fixture } = await createFixture({
      queryParams: { certificateId: 'certificate-1' },
    });
    const response = new Subject<PublicCertificateVerification>();
    api.validateCertificate.mockReturnValue(response);
    component.onTurnstileTokenChange('turnstile-token');
    expect(response.observed).toBe(true);

    fixture.destroy();
    response.next(verificationFixture);

    expect(response.observed).toBe(false);
    expect(component.state().status).toBe('loading');
    expect(TestBed.createComponent(CertificateValidation).componentInstance.state().status).toBe('challenge');
  });

  it('cancels an unfinished download when the page is destroyed', async () => {
    const { api, component, fixture } = await createFixture();
    const response = new Subject<never>();
    api.downloadCertificate.mockReturnValue(response);
    component.download(certificateFixture);
    expect(response.observed).toBe(true);

    fixture.destroy();

    expect(response.observed).toBe(false);
    expect(component.downloading()).toBe(false);
  });
  it('keeps the CACiC logo at the start of the global toolbar', async () => {
    const { fixture } = await createFixture();
    fixture.detectChanges();

    const toolbar = fixture.nativeElement.querySelector('mat-toolbar') as HTMLElement | null;
    const logo = toolbar?.querySelector('lib-cacic-logo') as HTMLElement | null;

    expect(
      Array.from(toolbar?.children ?? [])
        .slice(0, 3)
        .map((element) => element.tagName.toLowerCase()),
    ).toEqual(['a', 'lib-cacic-logo', 'h1']);
    expect(toolbar?.classList.contains('certificate-validation-toolbar')).toBe(true);
    expect(logo?.classList.contains('certificate-validation-toolbar-logo')).toBe(true);
    expect(toolbar?.querySelector('a[routerlink="/menu"]')).not.toBeNull();
    expect(toolbar?.querySelector('h1.global-toolbar-title')?.textContent).toContain('Validar certificado');
  });

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

  it('uses the code from the PDF body for a Turnstile-protected lookup', async () => {
    const { api, component, fixture, router } = await createFixture();
    const file = new File(['pdf contents'], 'unrelated-filename.pdf', { type: 'application/pdf' });
    api.validateCertificatePdf.mockReturnValue(of({ certificateId: 'certificate-1', ...verificationFixture }));
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.multiple).toBe(false);
    Object.defineProperty(input, 'files', { value: [file] });

    input.dispatchEvent(new Event('change'));
    expect(component.state()).toEqual({ status: 'challenge', source: 'pdf' });
    expect(api.validateCertificatePdf).not.toHaveBeenCalled();
    component.onTurnstileTokenChange('pdf-token');
    expect(api.validateCertificatePdf).toHaveBeenCalledExactlyOnceWith(file, 'pdf-token');
    expect(api.validateCertificate).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/validate'], { queryParams: { certificateId: 'certificate-1' } });
  });

  it('rejects multiple files and reports when a PDF has no unique code', async () => {
    const { api, component, fixture } = await createFixture();
    const file = new File(['pdf contents'], 'certificate.pdf', { type: 'application/pdf' });
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file, file], configurable: true });

    component.onTurnstileTokenChange('pdf-token');
    component.selectCertificatePdf(input);
    expect(component.pdfError()).toBe('Selecione um único arquivo PDF.');
    expect(api.validateCertificatePdf).not.toHaveBeenCalled();

    api.validateCertificatePdf.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422 })));
    Object.defineProperty(input, 'files', { value: [file] });
    component.selectCertificatePdf(input);
    expect(component.pdfError()).toContain('Não foi possível identificar um único código');
    expect(component.readingPdf()).toBe(false);
    expect(api.validateCertificate).not.toHaveBeenCalled();
  });

  it.each(['path', 'query'])(
    'restores a successful %s lookup after leaving and recreating the page',
    async (source) => {
      const { api, component, fixture } = await createFixture(
        source === 'path'
          ? { routeParams: { certificateId: 'certificate-1' } }
          : { queryParams: { certificateId: 'certificate-1' } },
      );
      component.onTurnstileTokenChange('turnstile-token');
      fixture.destroy();

      const returnedFixture = TestBed.createComponent(CertificateValidation);
      const returnedComponent = returnedFixture.componentInstance;
      returnedFixture.detectChanges();

      expect(returnedComponent.state()).toEqual({ status: 'ready', certificate: certificateFixture });
      expect(returnedComponent.certificateLookupModel().certificateId).toBe('certificate-1');
      expect(returnedComponent.turnstileToken()).toBeNull();
      expect(returnedFixture.nativeElement.textContent).toContain('Ada Lovelace');
      expect(api.validateCertificate).toHaveBeenCalledTimes(1);

      // A newly rendered CAPTCHA must not trigger another lookup for restored results.
      returnedComponent.onTurnstileTokenChange('new-widget-token');
      expect(api.validateCertificate).toHaveBeenCalledTimes(1);
    },
  );

  it('still validates a different certificate after restoring results', async () => {
    const { api, component, fixture, router } = await createFixture({
      queryParams: { certificateId: 'certificate-1' },
    });
    component.onTurnstileTokenChange('turnstile-token');
    fixture.destroy();
    const returnedComponent = TestBed.createComponent(CertificateValidation).componentInstance;

    returnedComponent.validationForm.certificateId().value.set('certificate-2');
    returnedComponent.submit();

    expect(router.navigate).toHaveBeenLastCalledWith(['/validate'], {
      queryParams: { certificateId: 'certificate-2' },
    });
    expect(returnedComponent.state().status).toBe('challenge');
    returnedComponent.onTurnstileTokenChange('fresh-token');
    expect(api.validateCertificate).toHaveBeenLastCalledWith('certificate-2', 'fresh-token');
  });

  it('performs explicit revalidation and discards old results when the certificate is no longer valid', async () => {
    const { api, component, fixture } = await createFixture({
      queryParams: { certificateId: 'certificate-1' },
    });
    component.onTurnstileTokenChange('turnstile-token');
    fixture.destroy();
    const returnedFixture = TestBed.createComponent(CertificateValidation);
    const returnedComponent = returnedFixture.componentInstance;
    api.validateCertificate.mockReturnValue(of({ certificate: null, revokedAt: null, previewToken: null }));

    returnedComponent.onTurnstileTokenChange('fresh-token');
    returnedComponent.submit();

    expect(api.validateCertificate).toHaveBeenCalledTimes(2);
    expect(returnedComponent.state().status).toBe('not-found');
    returnedFixture.destroy();
    expect(TestBed.createComponent(CertificateValidation).componentInstance.state().status).toBe('challenge');
  });

  it('keeps an invalid route certificate id as a signal-form validation error until the value changes', async () => {
    const { component } = await createFixture({ queryParams: { invalidId: 'missing-certificate' } });

    expect(component.validationForm.certificateId().value()).toBe('missing-certificate');
    expect(component.validationForm.certificateId().invalid()).toBe(true);
    expect(
      component.validationForm
        .certificateId()
        .errors()
        .some((error) => error.kind === 'notFound'),
    ).toBe(true);

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

  it('keeps missing and inactive certificates behind the same generic not-found error', async () => {
    const { api, component, fixture } = await createFixture({
      routeParams: { certificateId: 'disabled-certificate' },
    });
    api.validateCertificate.mockReturnValue(of({ certificate: null, revokedAt: null, previewToken: null }));

    component.onTurnstileTokenChange('turnstile-token');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.state()).toEqual({
      status: 'not-found',
    });
    expect(fixture.nativeElement.textContent).toContain('Certificado não encontrado');
    expect(
      component.validationForm
        .certificateId()
        .errors()
        .some((error) => error.kind === 'notFound'),
    ).toBe(true);
  });

  it('hides the activities section when the certificate has no linked activities', async () => {
    const { component, fixture } = await createFixture();

    component.state.set({
      status: 'ready',
      certificate: {
        ...certificateFixture,
        sections: [],
        totalCreditMinutes: 0,
      },
    });
    fixture.detectChanges();

    expect(component.hasActivitySections({ ...certificateFixture, sections: [] })).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Atividades');
  });

  it('renders configured certificate text and type metadata', async () => {
    const { component, fixture } = await createFixture();

    component.state.set({
      status: 'ready',
      certificate: {
        ...certificateFixture,
        issuedTo: 'LECTURER',
        certificateTypeLabel: 'Palestrante',
        certificateText: 'Certificamos a palestra ministrada.',
        shouldAutofillSecondPage: false,
        secondPageText: 'Atividade apresentada durante o evento.',
      },
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Palestrante');
    expect(text).toContain('Certificamos a palestra ministrada.');
    expect(text).toContain('Atividade apresentada durante o evento.');
  });

  it('starts a manual lookup before a CAPTCHA token is available', async () => {
    const { component, fixture } = await createFixture();
    component.validationForm.certificateId().value.set('certificate-2');
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    button.click();
    fixture.detectChanges();

    expect(component.state()).toEqual({ status: 'challenge', certificateId: 'certificate-2', source: 'manual' });
    expect(fixture.nativeElement.textContent).toContain('Conclua a verificação para validar.');
  });

  it('cancels the previous lookup while a new certificate awaits its challenge', async () => {
    const { api, component, router } = await createFixture({ queryParams: { certificateId: 'certificate-1' } });
    const previous = new Subject<PublicCertificateVerification>();
    api.validateCertificate.mockReturnValue(previous);
    component.onTurnstileTokenChange('first-token');

    await router.navigate(['/validate'], { queryParams: { certificateId: 'certificate-2' } });
    expect(previous.observed).toBe(false);
    previous.next(verificationFixture);
    previous.error(new Error('Old request failed'));

    expect(component.state()).toEqual({ status: 'challenge', certificateId: 'certificate-2', source: 'link' });
    const nextCertificate = { ...certificateFixture, id: 'certificate-2', personName: 'Outra pessoa' };
    api.validateCertificate.mockReturnValue(of({ ...verificationFixture, certificate: nextCertificate }));
    component.onTurnstileTokenChange('second-token');
    expect(component.state()).toEqual({ status: 'ready', certificate: nextCertificate });
  });

  it('cancels a previous download when switching certificates and allows a new download', async () => {
    const { api, component, router, fileDownload } = await createFixture({
      queryParams: { certificateId: 'certificate-1' },
    });
    component.onTurnstileTokenChange('first-token');
    const previous = new Subject<never>();
    api.downloadCertificate.mockReturnValue(previous);
    component.download(certificateFixture);
    expect(component.downloading()).toBe(true);

    await router.navigate(['/validate'], { queryParams: { certificateId: 'certificate-2' } });
    expect(previous.observed).toBe(false);
    expect(component.downloading()).toBe(false);
    const nextCertificate = { ...certificateFixture, id: 'certificate-2' };
    api.validateCertificate.mockReturnValue(of({ ...verificationFixture, certificate: nextCertificate }));
    component.onTurnstileTokenChange('second-token');
    const download = { fileName: 'certificate-2.pdf', mimeType: 'application/pdf', contentBase64: 'data' };
    api.downloadCertificate.mockReturnValue(of(download));
    component.download(nextCertificate);
    expect(fileDownload.save).toHaveBeenCalledExactlyOnceWith(download);
  });

  it('clears download errors on a new lookup and prevents duplicate download requests', async () => {
    const { api, component, router } = await createFixture({ queryParams: { certificateId: 'certificate-1' } });
    component.onTurnstileTokenChange('first-token');
    api.downloadCertificate.mockReturnValue(throwError(() => new Error('Falha no download anterior')));
    component.download(certificateFixture);
    expect(component.downloadError()).toBe('Falha no download anterior');

    await router.navigate(['/validate'], { queryParams: { certificateId: 'certificate-2' } });
    expect(component.downloadError()).toBeNull();
    api.downloadCertificate.mockReturnValue(new Subject());
    component.download({ ...certificateFixture, id: 'certificate-2' });
    component.download({ ...certificateFixture, id: 'certificate-2' });
    expect(api.downloadCertificate).toHaveBeenCalledTimes(2);
  });

  it('omits empty categories and renders separate activities with identical names and dates', async () => {
    const { component, fixture } = await createFixture();
    const startDate = new Date().toISOString();
    const event = { name: 'Oficina', startDate, endDate: startDate, emoji: '🎓', creditMinutes: 60 };
    component.state.set({
      status: 'ready',
      certificate: {
        ...certificateFixture,
        sections: [
          { title: 'Categoria vazia', creditMinutes: 0, events: [] },
          {
            title: 'Eventos certificados',
            creditMinutes: 120,
            events: [
              { ...event, id: 'event-1' },
              { ...event, id: 'event-2' },
            ],
          },
        ],
      },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Categoria vazia');
    const links = fixture.nativeElement.querySelectorAll('.event-section a') as NodeListOf<HTMLAnchorElement>;
    expect(links.length).toBe(2);
    expect(Array.from(links).every((link) => link.textContent?.includes('Oficina'))).toBe(true);
  });

  it.each([
    ['OTHER', 'Manual'],
    ['SPORTS_PLAYER', 'Atleta'],
    ['SPORTS_ORGANIZER', 'Organização'],
  ] as const)('labels %s certificates without relying on optional custom labels', async (issuedTo, label) => {
    const { component } = await createFixture();
    expect(component.certificateTypeLabel({ ...certificateFixture, issuedTo, certificateTypeLabel: null })).toBe(label);
  });

  it('does not repeat the certificate name when target metadata is unavailable', async () => {
    const { component, fixture } = await createFixture();
    component.state.set({ status: 'ready', certificate: { ...certificateFixture, targetName: null } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.certificate-context')?.textContent).toContain(
      certificateFixture.certificateName,
    );
    expect(fixture.nativeElement.querySelector('.certificate-name')).toBeNull();
  });
});

@Component({ template: '' })
class OtherPage {}

describe('CertificateValidation navigation lifecycle', () => {
  it.each(['/elsewhere', '/event/linked-event'])(
    'destroys the page when navigating to %s and restores data in a new instance',
    async (destination) => {
      const api = { validateCertificate: vi.fn(() => of(verificationFixture)) };
      await TestBed.configureTestingModule({
        providers: [
          provideNoopAnimations(),
          provideRouter([
            ...appRoutes.filter((route) => route.path?.startsWith('validate')),
            { path: 'elsewhere', component: OtherPage },
            { path: 'event/:id', component: OtherPage },
          ]),
          { provide: RouteReuseStrategy, useClass: AppRouteReuseStrategy },
          { provide: AuthService, useValue: { user: signal(null), isAuthenticated: signal(false) } },
          { provide: CertificateValidationApiService, useValue: api },
          { provide: CertificateFileDownloadService, useValue: { save: vi.fn() } },
          { provide: MatDialog, useValue: { open: vi.fn() } },
        ],
      }).compileComponents();
      const strategy = TestBed.inject(RouteReuseStrategy) as AppRouteReuseStrategy;
      strategy.start(TestBed.inject(Router));
      const harness = await RouterTestingHarness.create();
      const page = await harness.navigateByUrl('/validate?certificateId=certificate-1', CertificateValidation);
      const destroyed = vi.fn();
      harness.routeDebugElement?.injector.get(DestroyRef).onDestroy(destroyed);
      page.onTurnstileTokenChange('turnstile-token');

      await harness.navigateByUrl(destination, OtherPage);

      expect(destroyed).toHaveBeenCalledOnce();
      expect(harness.routeNativeElement?.querySelector('.validation-page')).toBeNull();
      const returnedPage = await harness.navigateByUrl('/validate?certificateId=certificate-1', CertificateValidation);
      expect(returnedPage).not.toBe(page);
      expect(returnedPage.state()).toEqual({ status: 'ready', certificate: certificateFixture });
      expect(returnedPage.turnstileToken()).toBeNull();
      expect(api.validateCertificate).toHaveBeenCalledOnce();
    },
  );
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
    validateCertificatePdf: ReturnType<typeof vi.fn>;
    downloadCertificate: ReturnType<typeof vi.fn>;
    requestPreview: ReturnType<typeof vi.fn>;
    previewCertificate: ReturnType<typeof vi.fn>;
  };
  fileDownload: { save: ReturnType<typeof vi.fn> };
  component: CertificateValidation;
  fixture: ComponentFixture<CertificateValidation>;
  router: {
    navigate: ReturnType<typeof vi.fn<(commands: unknown[], extras?: { queryParams?: Params }) => Promise<boolean>>>;
    url: string;
  };
}> {
  const paramMap = new BehaviorSubject(convertToParamMap(routeParams));
  const queryParamMap = new BehaviorSubject(convertToParamMap(queryParams));
  const api = {
    validateCertificate: vi.fn(() => of(verificationFixture)),
    validateCertificatePdf: vi.fn(),
    downloadCertificate: vi.fn(),
    requestPreview: vi.fn(),
    previewCertificate: vi.fn(),
  };
  const fileDownload = { save: vi.fn() };
  const router = {
    url: '/validate',
    navigate: vi.fn((commands: unknown[], extras?: { queryParams?: Params }) => {
      const nextRouteCertificateId =
        commands[0] === '/validate' && typeof commands[1] === 'string' ? commands[1] : null;
      paramMap.next(convertToParamMap(nextRouteCertificateId ? { certificateId: nextRouteCertificateId } : {}));
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
          user: signal(null),
          isAuthenticated: signal(false),
        },
      },
      {
        provide: CertificateValidationApiService,
        useValue: api,
      },
      {
        provide: CertificateFileDownloadService,
        useValue: fileDownload,
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
    fileDownload,
    component: fixture.componentInstance,
    fixture,
    router,
  };
}

const certificateFixture = {
  id: 'certificate-1',
  issuedAt: new Date(Date.now() - 86400000).toISOString(),
  personName: 'Ada Lovelace',
  maskedIdentityDocument: null,
  scope: 'EVENT',
  certificateName: 'Certificado',
  issuedTo: 'ATTENDEE',
  certificateTypeLabel: 'Participação',
  certificateText: null,
  shouldAutofillSecondPage: true,
  secondPageText: null,
  targetName: 'Evento teste',
  targetEmoji: '🎓',
  totalCreditMinutes: 60,
  sections: [],
} satisfies PublicCertificateValidation;

const verificationFixture = {
  certificate: certificateFixture,
  revokedAt: null,
  previewToken: 'preview-token',
} satisfies PublicCertificateVerification;
