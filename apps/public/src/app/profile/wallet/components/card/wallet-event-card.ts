import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatCPF, formatUnespRole, isValidCPF } from '@cacic-fct/shared-utils';
import { WalletBarcodeComponent } from '../barcode/barcode';
import { WalletCardUser } from './wallet-card.types';

@Component({
  selector: 'app-wallet-event-card',
  imports: [WalletBarcodeComponent],
  template: `
    <section class="ticket-holder" aria-label="Dados do portador">
      <div class="avatar-frame">
        <img
          [src]="user()?.picture || '/assets/shared/avatar-placeholder.svg'"
          alt="Avatar"
          class="avatar"
          referrerpolicy="no-referrer" />
      </div>
      <div class="holder-details">
        <h1>{{ user()?.name || 'Desconhecido' }}</h1>
        <h2>{{ formatRole() }}</h2>
      </div>
    </section>
    <section class="ticket-credential" aria-label="Código de identificação">
      <app-wallet-barcode label="Código de barras" class="aztec-code barcode-screen" [value]="user()?.userId || ''" />
      <app-wallet-barcode
        label="Código de barras para impressão"
        class="aztec-code barcode-print"
        [ariaHidden]="true"
        [errorCorrectionLevel]="'60'"
        [value]="user()?.userId || ''" />
      <p class="credential-hint">Apresente este código para confirmar sua presença.</p>
    </section>
    <footer class="ticket-footer">
      <p class="field-label">Documento</p>
      <h3 class="identity-document">{{ formatDocument(user()?.identityDocument || '') }}</h3>
    </footer>
  `,
  styles: `
    :host {
      display: block;
    }
    .ticket-holder {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 1rem;
      align-items: center;
      padding: 1.5rem 1.25rem 1.25rem;
    }
    .avatar-frame {
      display: grid;
      box-sizing: border-box;
      width: 4.25rem;
      height: 4.25rem;
      overflow: hidden;
      background: #3d3f97;
      border-radius: 50%;
    }
    .avatar {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: inherit;
    }
    .holder-details {
      min-width: 0;
    }
    .ticket-holder h1,
    .ticket-holder h2,
    .credential-hint,
    .ticket-footer p,
    .identity-document {
      margin: 0;
    }
    .ticket-holder h1 {
      margin-top: 0.1875rem;
      overflow-wrap: anywhere;
      font-size: clamp(1.25rem, 4vw, 1.625rem);
      font-weight: 760;
      line-height: 1.1;
      letter-spacing: -0.028em;
    }
    .ticket-holder h2 {
      margin-top: 0.375rem;
      color: #d8e4f5;
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.35;
    }
    .ticket-credential {
      display: grid;
      justify-items: center;
      padding: 1.25rem;
      color: #10233f;
      background: #f7f9ff;
    }
    .aztec-code {
      display: block;
      box-sizing: border-box;
      width: min(100%, 17.5rem);
      height: auto;
      padding: 0.75rem;
      overflow: hidden;
      background: #fff;
      border-radius: 0;
    }
    .credential-hint {
      margin-top: 0.75rem;
      color: #293444;
      font-size: 0.8125rem;
      line-height: 1.4;
      text-align: center;
    }
    .ticket-footer {
      padding: 1rem 1.25rem 1.25rem;
    }
    .field-label {
      color: #b8c8de;
      font-size: 0.6875rem;
      font-weight: 650;
      line-height: 1.35;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .identity-document {
      margin-top: 0.25rem;
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    .barcode-print {
      display: none;
    }
    @media screen and (max-width: 400px) {
      .ticket-holder,
      .ticket-credential,
      .ticket-footer {
        padding-inline: 1rem;
      }
    }
    @media print {
      .ticket-holder {
        display: flex;
        flex-direction: column;
        gap: 0.25cm;
        padding: 0;
        margin: 0 0 0.25cm;
      }
      .avatar-frame {
        width: 48px;
        height: 48px;
        padding: 0;
        background: transparent;
      }
      .holder-details {
        text-align: center;
      }
      .ticket-holder h1 {
        margin-bottom: 0 !important;
        font-size: 16pt;
      }
      .ticket-holder h2 {
        margin-top: 0 !important;
        color: #000 !important;
        font-size: 12pt;
      }
      .ticket-credential {
        padding: 0;
        background: transparent;
      }
      .barcode-screen,
      .barcode-screen * {
        display: none !important;
        visibility: hidden !important;
      }
      .barcode-print {
        display: block !important;
        width: 3.5cm !important;
        height: 3.5cm !important;
        padding: 0 !important;
        border-radius: 0;
      }
      .credential-hint,
      .field-label {
        display: none;
      }
      .ticket-footer {
        padding: 0;
      }
      .identity-document {
        margin-top: 0.5rem !important;
        margin-bottom: 0;
        font-size: 12pt !important;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletEventCard {
  readonly user = input<WalletCardUser | null>(null);
  protected readonly formatRole = computed(() =>
    formatUnespRole(this.user()?.unespRole, this.user()?.enrollmentNumber?.toString()),
  );

  protected formatDocument(document: string): string {
    return isValidCPF(document) ? formatCPF(document) : document;
  }
}
