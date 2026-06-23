import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CLOUDFLARE_TURNSTILE_CONFIG } from './cloudflare-turnstile.config';
import { CloudflareTurnstileService, TurnstileApi } from './cloudflare-turnstile.service';

@Component({
  selector: 'lib-cloudflare-turnstile',
  template: `
    @if (siteKey()) {
      <div class="cacic-turnstile" #container></div>
      @if (status() === 'error') {
        <p class="cacic-turnstile-error">Não foi possível carregar a verificação anti-spam.</p>
      }
    } @else {
      <p class="cacic-turnstile-error">Verificação anti-spam indisponível.</p>
    }
  `,
  styleUrl: './cloudflare-turnstile.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloudflareTurnstileComponent implements AfterViewInit, OnDestroy {
  private readonly config = inject(CLOUDFLARE_TURNSTILE_CONFIG);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly turnstile = inject(CloudflareTurnstileService);
  private readonly container = viewChild<ElementRef<HTMLDivElement>>('container');

  private api: TurnstileApi | null = null;
  private widgetId: string | null = null;
  private destroyed = false;

  readonly action = input<string | undefined>();
  readonly theme = input<'auto' | 'light' | 'dark'>('auto');
  readonly tokenChange = output<string | null>();
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly siteKey = signal(this.config.siteKey.trim());

  ngAfterViewInit(): void {
    void this.render();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.api && this.widgetId) {
      this.api.remove(this.widgetId);
    }
  }

  reset(): void {
    this.tokenChange.emit(null);
    if (this.api && this.widgetId) {
      this.api.reset(this.widgetId);
    }
  }

  private async render(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.siteKey()) {
      return;
    }

    const element = this.container()?.nativeElement;
    if (!element) {
      return;
    }

    this.status.set('loading');

    try {
      const api = await this.turnstile.load();
      if (this.destroyed) {
        return;
      }

      this.api = api;
      const widgetId = api.render(element, {
        sitekey: this.siteKey(),
        action: this.action(),
        theme: this.theme(),
        callback: (token) => {
          this.status.set('ready');
          this.tokenChange.emit(token);
        },
        'expired-callback': () => this.tokenChange.emit(null),
        'error-callback': () => {
          this.status.set('error');
          this.tokenChange.emit(null);
        },
        'timeout-callback': () => this.tokenChange.emit(null),
      });

      this.widgetId = widgetId ?? null;
      if (widgetId == null) {
        this.status.set('error');
        this.tokenChange.emit(null);
        return;
      }

      this.status.set('ready');
    } catch {
      this.status.set('error');
      this.tokenChange.emit(null);
    }
  }
}
