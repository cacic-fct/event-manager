import { isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, REQUEST, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  livestreamExternalUrl,
  normalizeLivestreamValue,
  type LivestreamProvider,
} from '@cacic-fct/shared-livestream';

@Component({
  selector: 'lib-livestream-embed',
  templateUrl: './livestream-embed.component.html',
  styleUrl: './livestream-embed.component.scss',
})
export class LivestreamEmbedComponent {
  readonly provider = input<LivestreamProvider | null>('GENERAL');
  readonly value = input.required<string>();
  readonly title = input('Transmissão ao vivo');

  private readonly sanitizer = inject(DomSanitizer);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly externalUrl = computed(() => livestreamExternalUrl(this.provider(), this.value()));
  readonly embedUrl = computed<SafeResourceUrl | null>(() => {
    const value = normalizeLivestreamValue(this.provider(), this.value());
    if (!value) {
      return null;
    }

    if (this.provider() === 'YOUTUBE') {
      return this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.youtube-nocookie.com/embed/${encodeURIComponent(value)}`,
      );
    }

    if (this.provider() === 'TWITCH') {
      const parent = this.parentHostname();
      if (!parent) {
        return null;
      }

      const url = new URL('https://player.twitch.tv/');
      url.searchParams.set('channel', value);
      url.searchParams.set('parent', parent);
      url.searchParams.set('autoplay', 'false');
      return this.sanitizer.bypassSecurityTrustResourceUrl(url.toString());
    }

    return null;
  });

  readonly isTwitch = computed(() => this.provider() === 'TWITCH');
  readonly externalLinkLabel = computed(() => {
    switch (this.provider()) {
      case 'YOUTUBE':
        return 'Abrir no YouTube';
      case 'TWITCH':
        return 'Abrir na Twitch';
      default:
        return 'Abrir transmissão';
    }
  });

  private parentHostname(): string | null {
    if (this.isBrowser) {
      return window.location.hostname || null;
    }

    const request = this.request;
    if (!request) {
      return null;
    }

    try {
      const requestUrl = new URL(request.url);
      if (requestUrl.hostname) {
        return requestUrl.hostname;
      }
    } catch {
      // Some SSR adapters provide a relative request URL.
    }

    const requestHost = request.headers.get('host') ?? request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    if (requestHost) {
      try {
        return new URL(`https://${requestHost}`).hostname || null;
      } catch {
        return null;
      }
    }

    return null;
  }
}
