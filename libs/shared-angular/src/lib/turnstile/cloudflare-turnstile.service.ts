import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

export interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  theme?: 'auto' | 'light' | 'dark';
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: (code?: string) => void;
  'timeout-callback'?: () => void;
}

export interface TurnstileApi {
  render(container: HTMLElement | string, options: TurnstileRenderOptions): string | undefined;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

@Injectable({ providedIn: 'root' })
export class CloudflareTurnstileService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  private loadPromise: Promise<TurnstileApi> | null = null;

  load(): Promise<TurnstileApi> {
    if (!isPlatformBrowser(this.platformId)) {
      return Promise.reject(new Error('Turnstile can only be loaded in the browser.'));
    }

    if (window.turnstile) {
      return Promise.resolve(window.turnstile);
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const existingScript = this.document.querySelector<HTMLScriptElement>(
        `script[src="${TURNSTILE_SCRIPT_URL}"]`,
      );
      const script = existingScript ?? this.document.createElement('script');

      const resolveWhenReady = () => {
        if (window.turnstile) {
          resolve(window.turnstile);
          return;
        }

        reject(new Error('Turnstile script loaded without exposing the API.'));
      };

      if (existingScript && window.turnstile) {
        resolveWhenReady();
        return;
      }

      script.addEventListener('load', resolveWhenReady, { once: true });
      script.addEventListener(
        'error',
        () => reject(new Error('Failed to load the Turnstile script.')),
        { once: true },
      );

      if (!existingScript) {
        script.src = TURNSTILE_SCRIPT_URL;
        script.async = true;
        script.defer = true;
        this.document.head.appendChild(script);
      }
    }).catch((error: unknown) => {
      this.loadPromise = null;
      throw error;
    });

    return this.loadPromise;
  }
}
