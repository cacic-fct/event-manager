import { Component } from '@angular/core';
import { OrganizerShowcaseComponent } from './organizer-showcase';
import { ParticipantShowcaseComponent } from './participant-showcase';

@Component({
  selector: 'app-landing-product-showcase',
  imports: [OrganizerShowcaseComponent, ParticipantShowcaseComponent],
  template: `
    <section class="product-showcase" aria-labelledby="showcase-title">
      <div class="showcase-container">
        <header class="showcase-introduction">
          <h2 id="showcase-title">Você participa. <br />Tudo se conecta.</h2>
          <p>
            Programação, inscrições e presença.<br class="desktop-break" />
            Acompanhe em um só lugar.
          </p>
        </header>
        @defer (on viewport) {
          <app-landing-participant-showcase />
        } @placeholder {
          <div class="audience-placeholder"><p>Carregando demonstração para participantes.</p></div>
        } @error {
          <p role="status">Não foi possível carregar a demonstração. Recarregue a página para tentar novamente.</p>
        }
      </div>
    </section>
    <section class="product-showcase organizer-section" aria-labelledby="organizer-showcase-title">
      <div class="showcase-container">
        <header class="showcase-introduction">
          <h2 id="organizer-showcase-title">Você organiza<br />com tudo à mão.</h2>
          <p>
            Das primeiras inscrições ao último certificado.<br class="desktop-break" />
            Organize a programação e acompanhe cada etapa do evento.
          </p>
        </header>
        @defer (on viewport) {
          <app-landing-organizer-showcase />
        } @placeholder {
          <div class="audience-placeholder"><p>Carregando demonstração para organizadores.</p></div>
        } @error {
          <p role="status">Não foi possível carregar a demonstração. Recarregue a página para tentar novamente.</p>
        }
      </div>
    </section>
  `,
  styleUrl: './product-showcase.scss',
})
export class ProductShowcaseComponent {}
