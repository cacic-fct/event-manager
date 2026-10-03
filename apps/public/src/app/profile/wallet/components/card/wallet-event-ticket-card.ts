import { DatePipe, NgOptimizedImage } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import type { WalletTicket } from '@cacic-fct/shared-ticketing';
import { formatCPF, formatUnespRole, isValidCPF } from '@cacic-fct/shared-utils';
import { WalletBarcodeComponent } from '../barcode/barcode';
import type { WalletCardUser } from './wallet-card.types';
import { ticketExpirationReason } from '../../../ticketing/ticket-expiration';

@Component({
  selector: 'app-wallet-event-ticket-card',
  imports: [DatePipe, NgOptimizedImage, WalletBarcodeComponent],
  template: `
    @let eventTicket = ticket();
    <section class="ticket-holder" aria-label="Dados do portador do bilhete">
      <div class="avatar-frame">
        <img
          [ngSrc]="googlePictureUrl(user()?.picture ?? eventTicket.holder?.avatarUrl ?? null) || '/assets/icons/avatar-placeholder.avif'"
          fill
          alt=""
          class="avatar"
          referrerpolicy="no-referrer" />
      </div>
      <div class="holder-details">
        <h2>{{ user()?.name ?? eventTicket.holder?.fullName ?? 'Portador do bilhete' }}</h2>
        <p>{{ formatRole() }}</p>
      </div>
    </section>
    <section class="ticket-credential" aria-label="Código do bilhete">
      @if (eventTicket.aztecPayload) {
        <app-wallet-barcode
          class="aztec-code"
          [class.expired-barcode]="isExpired()"
          label="Código do bilhete"
          [value]="eventTicket.aztecPayload"
          [ariaHidden]="isExpired()"
          [payloadPrefix]="''" />
      }
      @if (isExpired()) {
        <div class="ticket-expiration-notice" role="status">
          <p>Expirado</p>
          <p>{{ expirationReason() }}</p>
        </div>
      } @else if (eventTicket.aztecPayload) {
        <p class="credential-hint">Apresente este código para utilizar o bilhete.</p>
      } @else {
        <p class="credential-hint" role="status">Código indisponível</p>
      }
    </section>
    <footer class="ticket-footer">
      <div>
        <p class="field-label">Documento</p>
        <p class="identity-document">{{ document() }}</p>
      </div>
      <div>
        <p class="field-label">Válido até</p>
        <p>{{ eventTicket.effectiveExpiresAt | date: 'dd/MM/yyyy HH:mm' }}</p>
      </div>
    </footer>
  `,
  styles: `
    :host {
      display: block;
    }

    .ticket-holder {
      align-items: center;
      display: grid;
      gap: 1rem;
      grid-template-columns: auto minmax(0, 1fr);
      padding: 1.5rem 1.25rem 1.25rem;
    }

    .avatar-frame {
      background: #3d3f97;
      border-radius: 50%;
      box-sizing: border-box;
      height: 4.25rem;
      overflow: hidden;
      position: relative;
      width: 4.25rem;
    }

    .avatar {
      border-radius: inherit;
      height: 100%;
      object-fit: cover;
      width: 100%;
    }

    .holder-details {
      min-width: 0;
    }

    .holder-details h2,
    .holder-details p,
    .credential-hint,
    .ticket-footer p {
      margin: 0;
    }

    .holder-details h2 {
      font-size: clamp(1.125rem, 4vw, 1.5rem);
      font-weight: 760;
      letter-spacing: -0.028em;
      line-height: 1.1;
      overflow-wrap: anywhere;
    }

    .holder-details p {
      color: #d8e4f5;
      font-size: 0.875rem;
      line-height: 1.4;
      margin-top: 0.375rem;
    }

    .ticket-credential {
      display: grid;
      justify-items: center;
      padding: 1.25rem;
    }

    .aztec-code {
      background: #fff;
      box-sizing: border-box;
      display: block;
      height: auto;
      overflow: hidden;
      padding: 0.75rem;
      width: min(100%, 17.5rem);
    }

    .credential-hint {
      color: #d8e4f5;
      font-size: 0.8125rem;
      line-height: 1.4;
      margin-top: 0.75rem;
      text-align: center;
    }

    .expired-barcode {
      opacity: 0.35;
    }

    .ticket-expiration-notice {
      margin-top: 0.75rem;
      text-align: center;
    }

    .ticket-expiration-notice p {
      margin: 0;
    }

    .ticket-expiration-notice p:first-child {
      font-weight: 700;
    }

    .ticket-expiration-notice p + p {
      color: #d8e4f5;
      font-size: 0.875rem;
      margin-top: 0.25rem;
    }

    .ticket-footer {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem 2rem;
      justify-content: space-between;
      padding: 1rem 1.25rem 1.25rem;
    }

    .ticket-footer > div {
      min-width: 7rem;
    }

    .field-label {
      color: #b8c8de;
      font-size: 0.6875rem;
      font-weight: 650;
      letter-spacing: 0.02em;
      line-height: 1.35;
      text-transform: uppercase;
    }

    .ticket-footer > div > p:last-child {
      font-size: 0.9375rem;
      font-weight: 700;
      margin-top: 0.25rem;
    }

    @media screen and (max-width: 400px) {
      .ticket-holder,
      .ticket-credential,
      .ticket-footer {
        padding-inline: 1rem;
      }
    }
  `,
})
export class WalletEventTicketCard {
  readonly ticket = input.required<WalletTicket>();
  readonly user = input<WalletCardUser | null>(null);
  readonly status = input<WalletTicket['status'] | null>(null);
  readonly displayStatus = computed(() => this.status() ?? this.ticket().status);
  readonly isExpired = computed(() => this.displayStatus() !== 'ACTIVE');
  readonly expirationReason = computed(() => ticketExpirationReason(this.displayStatus()));
  readonly formatRole = computed(() => formatUnespRole(this.user()?.unespRole, this.user()?.enrollmentNumber?.toString()));
  readonly document = computed(() => {
    const value = this.user()?.identityDocument ?? '';
    return isValidCPF(value) ? formatCPF(value) : value;
  });

  googlePictureUrl(url: string | null): string {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'lh3.googleusercontent.com') return url;
      return url.replace(/([=/])s\d+(?=[-/=]|$)/, '$1s512');
    } catch {
      return url;
    }
  }

}
