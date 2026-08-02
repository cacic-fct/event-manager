import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { WalletCardUser } from './wallet-card.types';

@Component({
  selector: 'app-wallet-academic-record-card',
  template: `
    <section class="ticket-details">
      <p class="card-overline">Aluno de graduação</p>
      <h1>{{ user()?.name || 'Desconhecido' }}</h1>
      <p class="card-value">{{ user()?.enrollmentNumber }}</p>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .ticket-details {
      display: grid;
      gap: 0.75rem;
      padding: 1.5rem 1.25rem;
    }
    h1,
    p {
      margin: 0;
    }
    h1 {
      overflow-wrap: anywhere;
      font-size: clamp(1.4rem, 5vw, 1.75rem);
      line-height: 1.1;
      letter-spacing: -0.028em;
    }
    .card-overline {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      opacity: 0.75;
    }
    .card-value {
      font-size: clamp(1.75rem, 7vw, 2.35rem);
      font-weight: 800;
      letter-spacing: -0.04em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletAcademicRecordCard {
  readonly user = input<WalletCardUser | null>(null);
}
