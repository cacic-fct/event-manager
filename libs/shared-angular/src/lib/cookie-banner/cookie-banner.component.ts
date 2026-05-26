import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CookieBannerAcceptContext, CookieBannerOptions } from './cookie-banner';

const DEFAULT_STORAGE_KEY = 'cacic.cookieBanner.accepted';

@Component({
  selector: 'lib-cookie-banner',
  template: `
    @if (visible()) {
      <section
        [class]="bannerClass()"
        role="banner"
        [attr.aria-label]="ariaLabel()"
      >
        <div class="cacic-cookie-banner_content">
          <div class="cacic-cookie-banner_text">
            <span class="cacic-cookie-banner_icon" aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="32"
                viewBox="0 -960 960 960"
                width="32"
                fill="#ff9800"
                focusable="false"
              >
                <path
                  d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-75 29-147t81-128.5q52-56.5 125-91T475-881q21 0 43 2t45 7q-9 45 6 85t45 66.5q30 26.5 71.5 36.5t85.5-5q-26 59 7.5 113t99.5 56q1 11 1.5 20.5t.5 20.5q0 82-31.5 154.5t-85.5 127q-54 54.5-127 86T480-80Zm-60-480q25 0 42.5-17.5T480-620q0-25-17.5-42.5T420-680q-25 0-42.5 17.5T360-620q0 25 17.5 42.5T420-560Zm-80 200q25 0 42.5-17.5T400-420q0-25-17.5-42.5T340-480q-25 0-42.5 17.5T280-420q0 25 17.5 42.5T340-360Zm260 40q17 0 28.5-11.5T640-360q0-17-11.5-28.5T600-400q-17 0-28.5 11.5T560-360q0 17 11.5 28.5T600-320ZM480-160q122 0 216.5-84T800-458q-50-22-78.5-60T683-603q-77-11-132-66t-68-132q-80-2-140.5 29t-101 79.5Q201-644 180.5-587T160-480q0 133 93.5 226.5T480-160Zm0-324Z"
                />
              </svg>
            </span>

            <div class="cacic-cookie-banner_text-content">
              <p>
                {{ text() }}
                <a [href]="privacyPolicyUrl()" target="_blank" rel="noopener noreferrer">
                  Política de Privacidade </a
                >.
              </p>
            </div>
          </div>

          <div class="cacic-cookie-banner_actions">
            <button
              class="cacic-cookie-banner_accept"
              type="button"
              aria-label="Aceitar cookies"
              [class.cacic-cookie-banner_accept-loading]="accepting()"
              [disabled]="accepting()"
              (click)="accept()"
            >
              <span class="cacic-cookie-banner_accept-icon" aria-hidden="true">✓</span>
              <span class="cacic-cookie-banner_spinner" aria-hidden="true"></span>
              <span>{{ buttonText() }}</span>
            </button>
          </div>
        </div>
      </section>
    }
  `,
  styleUrl: './cookie-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CookieBannerComponent implements OnInit {
  readonly config = input.required<CookieBannerOptions>();

  protected readonly visible = signal(false);
  protected readonly accepting = signal(false);
  protected readonly privacyPolicyUrl = computed(
    () => this.config().privacyPolicyUrl ?? 'https://cacic.dev.br/legal/privacy-policy',
  );
  protected readonly storageKey = computed(() => this.config().storageKey ?? DEFAULT_STORAGE_KEY);
  protected readonly text = computed(
    () =>
      this.config().text ??
      'Usamos cookies e outras tecnologias para melhorar a sua experiência, analisar o uso do site e personalizar conteúdo. Ao utilizar nossos serviços, você está ciente dessa funcionalidade. Confira a nossa ',
  );
  protected readonly buttonText = computed(() => this.config().buttonText ?? 'Prosseguir');
  protected readonly ariaLabel = computed(() => this.config().ariaLabel ?? 'Aviso sobre cookies');
  protected readonly bannerClass = computed(() =>
    ['cacic-cookie-banner', this.config().className ?? ''].filter(Boolean).join(' '),
  );

  private readonly platformId = inject(PLATFORM_ID);

  async ngOnInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || this.hasAcceptedLocally()) {
      return;
    }

    const shouldShow = this.config().shouldShow;
    this.visible.set(shouldShow ? await shouldShow() : true);
  }

  protected async accept(): Promise<void> {
    if (this.accepting()) {
      return;
    }

    this.accepting.set(true);

    try {
      const context: CookieBannerAcceptContext = {
        isAuthenticated: Boolean(await this.config().isAuthenticated?.()),
      };
      const result = await this.config().onAccept?.(context);

      if (result === false) {
        this.accepting.set(false);
        return;
      }

      this.saveAcceptedLocally();
      this.visible.set(false);
    } catch (error) {
      console.error('Error accepting cookie banner:', error);
      this.accepting.set(false);
    }
  }

  private hasAcceptedLocally(): boolean {
    try {
      return globalThis.localStorage?.getItem(this.storageKey()) === 'true';
    } catch {
      return false;
    }
  }

  private saveAcceptedLocally(): void {
    try {
      globalThis.localStorage?.setItem(this.storageKey(), 'true');
    } catch {
      return;
    }
  }
}
