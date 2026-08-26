import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { EventFormDescriptionContentComponent } from './event-form-description-content.component';

describe('EventFormDescriptionContentComponent', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
  });

  afterAll(() => {
    TestBed.resetTestEnvironment();
  });
  it('renders description text, image alternative text, and caption', async () => {
    await TestBed.configureTestingModule({ imports: [EventFormDescriptionContentComponent] }).compileComponents();
    const fixture = TestBed.createComponent(EventFormDescriptionContentComponent);
    Object.assign(fixture.componentInstance, {
      text: () => 'Descrição do formulário',
      images: () => [
        {
          id: 'image-1',
          url: '/image.avif',
          width: 800,
          height: 450,
          altText: 'Pessoas reunidas',
          caption: 'Encontro anual',
        },
      ],
    });

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.description-text')?.textContent).toContain('Descrição do formulário');
    expect(fixture.nativeElement.querySelector('img')?.getAttribute('alt')).toBe('Pessoas reunidas');
    expect(fixture.nativeElement.querySelector('figcaption')?.textContent).toContain('Encontro anual');
  });

  it('renders an image-only description without an empty caption', async () => {
    await TestBed.configureTestingModule({ imports: [EventFormDescriptionContentComponent] }).compileComponents();
    const fixture = TestBed.createComponent(EventFormDescriptionContentComponent);
    Object.assign(fixture.componentInstance, {
      text: () => undefined,
      images: () => [{ id: 'image-2', url: '/image-2.avif', width: 640, height: 360, altText: 'Auditório' }],
    });

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.description-text')).toBeNull();
    expect(fixture.nativeElement.querySelector('img')?.getAttribute('alt')).toBe('Auditório');
    expect(fixture.nativeElement.querySelector('figcaption')).toBeNull();
  });
});
