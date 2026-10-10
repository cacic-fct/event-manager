import '@angular/compiler';
import { PLATFORM_ID, REQUEST, ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { readFile } from 'node:fs/promises';
import { LivestreamEmbedComponent } from './livestream-embed.component';

describe('LivestreamEmbedComponent', () => {
  beforeAll(async () => {
    TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
    await resolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
  });

  afterAll(() => {
    TestBed.resetTestEnvironment();
  });

  async function configure(
    platformId: 'browser' | 'server' = 'browser',
    request: Request | null = null,
  ): Promise<ComponentFixture<LivestreamEmbedComponent>> {
    TestBed.configureTestingModule({
      imports: [LivestreamEmbedComponent],
      providers: [
        { provide: PLATFORM_ID, useValue: platformId },
        { provide: REQUEST, useValue: request },
      ],
    });

    await TestBed.compileComponents();
    return TestBed.createComponent(LivestreamEmbedComponent);
  }

  function setInputs(
    fixture: ComponentFixture<LivestreamEmbedComponent>,
    provider: 'YOUTUBE' | 'TWITCH' | 'GENERAL',
    value: string,
    title = 'Transmissão ao vivo',
  ): void {
    Object.assign(fixture.componentInstance, {
      provider: () => provider,
      value: () => value,
      title: () => title,
    });
  }

  afterEach(() => TestBed.resetTestingModule());

  it('keeps YouTube embeds on the privacy-enhanced host and canonicalizes the outbound link', async () => {
    const fixture = await configure();
    setInputs(
      fixture,
      'YOUTUBE',
      'https://www.youtube.com/watch?v=event-video&utm_source=admin',
      'Transmissão do evento',
    );
    fixture.detectChanges();

    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement | null;
    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement | null;
    expect(iframe?.src).toBe('https://www.youtube-nocookie.com/embed/event-video');
    expect(iframe?.title).toBe('Transmissão do evento');
    expect(link?.href).toBe('https://www.youtube.com/watch?v=event-video');
    expect(link?.getAttribute('aria-label')).toBe('Abrir no YouTube: Transmissão do evento');

    fixture.destroy();
  });

  it('embeds Twitch without chat, using the current browser hostname and fixed sandbox permissions', async () => {
    const fixture = await configure();
    setInputs(fixture, 'TWITCH', 'https://www.twitch.tv/tacacomputa');
    fixture.detectChanges();

    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement | null;
    const source = new URL(iframe?.src ?? 'about:blank');
    expect(source.origin).toBe('https://player.twitch.tv');
    expect(source.searchParams.get('channel')).toBe('cacic');
    expect(source.searchParams.get('parent')).toBe(window.location.hostname);
    expect(source.searchParams.get('autoplay')).toBe('false');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups-to-escape-sandbox');
    expect(fixture.nativeElement.querySelector('a')?.href).toBe('https://www.twitch.tv/cacic');

    fixture.destroy();
  });

  it('uses the incoming hostname during SSR and leaves a canonical link when no request host exists', async () => {
    const request = new Request('https://eventos.cacic.com.br/sports/match/1');
    const fixture = await configure('server', request);
    setInputs(fixture, 'TWITCH', 'cacic');
    fixture.detectChanges();

    const source = new URL((fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement).src);
    expect(source.searchParams.get('parent')).toBe('eventos.cacic.com.br');
    fixture.destroy();
    TestBed.resetTestingModule();

    const requestlessFixture = await configure('server');
    setInputs(requestlessFixture, 'TWITCH', 'https://www.twitch.tv/cacic');
    requestlessFixture.detectChanges();
    expect(requestlessFixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(requestlessFixture.nativeElement.querySelector('a')?.href).toBe('https://www.twitch.tv/cacic');

    requestlessFixture.destroy();
  });

  it('renders general streams as an outbound link without creating a player', async () => {
    const fixture = await configure();
    setInputs(fixture, 'GENERAL', 'https://stream.example.test/live');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.querySelector('a')?.href).toBe('https://stream.example.test/live');

    fixture.destroy();
  });
});
