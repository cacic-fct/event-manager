export interface CookieBannerAcceptContext {
  isAuthenticated: boolean;
}

export interface CookieBannerOptions {
  mount?: HTMLElement | string;
  privacyPolicyUrl?: string;
  storageKey?: string;
  isAuthenticated?: () => boolean | Promise<boolean>;
  shouldShow?: () => boolean | Promise<boolean>;
  onAccept?: (context: CookieBannerAcceptContext) => void | boolean | Promise<void | boolean>;
  text?: string;
  buttonText?: string;
  ariaLabel?: string;
  className?: string;
  autoMount?: boolean;
}

const DEFAULT_STORAGE_KEY = 'cacic.cookieBanner.accepted';

export class CookieBanner {
  private readonly options: Required<
    Pick<CookieBannerOptions, 'privacyPolicyUrl' | 'storageKey' | 'text' | 'buttonText' | 'ariaLabel' | 'autoMount'>
  > &
    CookieBannerOptions;

  private root: HTMLElement | null = null;
  private acceptButton: HTMLButtonElement | null = null;
  private mounted = false;
  private accepting = false;

  constructor(options: CookieBannerOptions = {}) {
    this.options = {
      privacyPolicyUrl: 'https://cacic.dev.br/legal/privacy-policy',
      storageKey: DEFAULT_STORAGE_KEY,
      text:
        'Usamos cookies e outras tecnologias para melhorar a sua experiência, analisar o uso do site e personalizar conteúdo. Ao utilizar nossos serviços, você está ciente dessa funcionalidade. Confira a nossa ',
      buttonText: 'Prosseguir',
      ariaLabel: 'Aviso sobre cookies',
      autoMount: true,
      ...options,
    };

    if (this.options.autoMount) {
      void this.init();
    }
  }

  async init(): Promise<void> {
    if (typeof document === 'undefined' || this.mounted) {
      return;
    }

    if (!(await this.resolveShouldShow())) {
      return;
    }

    this.render();
  }

  destroy(): void {
    this.root?.remove();
    this.root = null;
    this.acceptButton = null;
    this.mounted = false;
  }

  show(): void {
    if (typeof document === 'undefined' || this.mounted) {
      return;
    }

    this.render();
  }

  hide(): void {
    this.destroy();
  }

  private async resolveShouldShow(): Promise<boolean> {
    if (this.hasAcceptedLocally()) {
      return false;
    }

    return this.options.shouldShow ? await this.options.shouldShow() : true;
  }

  private render(): void {
    const mount = this.resolveMount();
    const root = document.createElement('div');
    root.className = ['cacic-cookie-banner', this.options.className ?? ''].filter(Boolean).join(' ');
    root.setAttribute('role', 'banner');
    root.setAttribute('aria-label', this.options.ariaLabel);

    root.innerHTML = `
      <div class="cacic-cookie-banner_content">
        <div class="cacic-cookie-banner_text">
          <span class="cacic-cookie-banner_icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="#ff9800"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-75 29-147t81-128.5q52-56.5 125-91T475-881q21 0 43 2t45 7q-9 45 6 85t45 66.5q30 26.5 71.5 36.5t85.5-5q-26 59 7.5 113t99.5 56q1 11 1.5 20.5t.5 20.5q0 82-31.5 154.5t-85.5 127q-54 54.5-127 86T480-80Zm-60-480q25 0 42.5-17.5T480-620q0-25-17.5-42.5T420-680q-25 0-42.5 17.5T360-620q0 25 17.5 42.5T420-560Zm-80 200q25 0 42.5-17.5T400-420q0-25-17.5-42.5T340-480q-25 0-42.5 17.5T280-420q0 25 17.5 42.5T340-360Zm260 40q17 0 28.5-11.5T640-360q0-17-11.5-28.5T600-400q-17 0-28.5 11.5T560-360q0 17 11.5 28.5T600-320ZM480-160q122 0 216.5-84T800-458q-50-22-78.5-60T683-603q-77-11-132-66t-68-132q-80-2-140.5 29t-101 79.5Q201-644 180.5-587T160-480q0 133 93.5 226.5T480-160Zm0-324Z"/></svg>
          </span>

          <div class="cacic-cookie-banner_text-content">
            <p>
              ${this.escapeHtml(this.options.text)}
              <a href="${this.escapeAttribute(this.options.privacyPolicyUrl)}" target="_blank" rel="noopener noreferrer">
                Política de Privacidade
              </a>.
            </p>
          </div>
        </div>

        <div class="cacic-cookie-banner_actions">
          <button class="cacic-cookie-banner_accept" type="button" aria-label="Aceitar cookies">
            <span class="cacic-cookie-banner_accept-icon" aria-hidden="true">✓</span>
            <span class="cacic-cookie-banner_spinner" aria-hidden="true"></span>
            <span>${this.escapeHtml(this.options.buttonText)}</span>
          </button>
        </div>
      </div>
    `;

    this.root = root;
    this.acceptButton = root.querySelector<HTMLButtonElement>('.cacic-cookie-banner_accept');
    this.acceptButton?.addEventListener('click', () => {
      void this.accept();
    });

    mount.appendChild(root);
    this.mounted = true;
  }

  private async accept(): Promise<void> {
    if (this.accepting) {
      return;
    }

    this.setAccepting(true);

    try {
      const isAuthenticated = await this.resolveIsAuthenticated();
      const result = await this.options.onAccept?.({ isAuthenticated });

      if (result === false) {
        this.setAccepting(false);
        return;
      }

      this.saveAcceptedLocally();
      this.hide();
    } catch (error) {
      console.error('Error accepting cookie banner:', error);
      this.setAccepting(false);
    }
  }

  private async resolveIsAuthenticated(): Promise<boolean> {
    return Boolean(await this.options.isAuthenticated?.());
  }

  private resolveMount(): HTMLElement {
    if (!this.options.mount) {
      return document.body;
    }

    if (typeof this.options.mount === 'string') {
      const element = document.querySelector<HTMLElement>(this.options.mount);
      if (!element) {
        throw new Error(`Cookie banner mount element not found: ${this.options.mount}`);
      }

      return element;
    }

    return this.options.mount;
  }

  private setAccepting(value: boolean): void {
    this.accepting = value;

    if (!this.acceptButton) {
      return;
    }

    this.acceptButton.disabled = value;
    this.acceptButton.classList.toggle('cacic-cookie-banner_accept-loading', value);
  }

  private hasAcceptedLocally(): boolean {
    try {
      return globalThis.localStorage?.getItem(this.options.storageKey) === 'true';
    } catch {
      return false;
    }
  }

  private saveAcceptedLocally(): void {
    try {
      globalThis.localStorage?.setItem(this.options.storageKey, 'true');
    } catch {
      return;
    }
  }

  private escapeHtml(value: string): string {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
  }

  private escapeAttribute(value: string): string {
    return value.replace(/"/g, '&quot;');
  }
}

export function createCookieBanner(options?: CookieBannerOptions): CookieBanner {
  return new CookieBanner(options);
}
