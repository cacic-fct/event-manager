import '@angular/compiler';
import { DOCUMENT } from '@angular/common';
import { EnvironmentInjector, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { MailtoService } from './mailto.service';

describe('MailtoService', () => {
  const rootEnvironmentInjector = null as unknown as EnvironmentInjector;

  it('composes recipients and encodes every supported message field', () => {
    const service = createService({ location: { href: '' } });

    expect(
      service.compose({
        to: ['ana@example.com', 'bruno@example.com'],
        cc: ['coord@example.com'],
        bcc: 'audit@example.com',
        subject: 'Inscrição & presença',
        body: 'Olá,\nconfirme sua presença.',
      }),
    ).toBe(
      'mailto:ana@example.com,bruno@example.com?cc=coord%40example.com&bcc=audit%40example.com&subject=Inscri%C3%A7%C3%A3o%20%26%20presen%C3%A7a&body=Ol%C3%A1%2C%0Aconfirme%20sua%20presen%C3%A7a.',
    );
  });

  it('omits empty query fields and supports an empty draft', () => {
    const service = createService({ location: { href: '' } });

    expect(service.compose()).toBe('mailto:');
    expect(service.compose({ to: 'ana@example.com', subject: '' })).toBe('mailto:ana@example.com');
  });

  it('opens the composed mail draft through the injected document', () => {
    const document = { location: { href: '' } };
    const service = createService(document);

    service.open({ to: 'ana@example.com', subject: 'Contato' });

    expect(document.location.href).toBe('mailto:ana@example.com?subject=Contato');
  });

  function createService(document: { location: { href: string } }): MailtoService {
    const injector = createEnvironmentInjector([{ provide: DOCUMENT, useValue: document }], rootEnvironmentInjector);
    const service = runInInjectionContext(injector, () => new MailtoService());
    injector.destroy();
    return service;
  }
});
