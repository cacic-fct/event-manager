import '@angular/compiler';
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { DocumentSeoService } from './document-seo.service';

describe('DocumentSeoService', () => {
  let service: DocumentSeoService;

  beforeEach(() => {
    document.head
      .querySelectorAll('link[rel="canonical"], #test-structured-data')
      .forEach((element) => element.remove());
    TestBed.configureTestingModule({
      providers: [DocumentSeoService],
    });
    service = TestBed.inject(DocumentSeoService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('updates document title and named or Open Graph metadata', () => {
    service.setTitle('Evento teste - CACiC Eventos');
    service.setNameMeta('description', 'Descrição do evento.');
    service.setPropertyMeta('og:title', 'Evento teste - CACiC Eventos');

    expect(document.title).toBe('Evento teste - CACiC Eventos');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Descrição do evento.');
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'Evento teste - CACiC Eventos',
    );
  });

  it('adds, updates, and removes canonical and JSON-LD elements', () => {
    service.setCanonicalUrl('https://eventos.cacic.com.br/app/event/event-1');
    service.setCanonicalUrl('https://eventos.cacic.com.br/app/event/event-2');
    service.setJsonLd('test-structured-data', {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Evento teste',
    });

    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://eventos.cacic.com.br/app/event/event-2',
    );
    expect(JSON.parse(document.getElementById('test-structured-data')?.textContent ?? '')).toMatchObject({
      '@type': 'Event',
      name: 'Evento teste',
    });

    service.removeCanonicalUrl();
    service.removeJsonLd('test-structured-data');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.getElementById('test-structured-data')).toBeNull();
  });

  it('writes JSON-LD with an SSR-compatible script element', () => {
    const script = { id: '', type: '', textContent: '' } as unknown as HTMLScriptElement;
    const serverDocument = {
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => script),
      head: { appendChild: vi.fn() },
    } as unknown as Document;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [DocumentSeoService, { provide: DOCUMENT, useValue: serverDocument }],
    });
    const serverService = TestBed.inject(DocumentSeoService);

    serverService.setJsonLd('test-structured-data', { '@type': 'Event' });

    expect(script.id).toBe('test-structured-data');
    expect(script.type).toBe('application/ld+json');
    expect(script.textContent).toBe('{"@type":"Event"}');
  });
});
