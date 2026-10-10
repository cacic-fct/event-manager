import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { EventContextPickerComponent, type EventContextRef } from '../shared/event-context-picker.component';

@Component({
  selector: 'app-ticket-admin-landing-page',
  imports: [EventContextPickerComponent, MatIconModule],
  template: `
    <section class="section ticket-landing">
      <p>Selecione um evento para configurar emissões, transferências e compras de bilhetes adicionais.</p>
      <div class="picker-heading">
        <mat-icon aria-hidden="true">event_search</mat-icon>
        <h2>Selecionar evento</h2>
      </div>
      <app-event-context-picker [searchOnly]="true" [allowGroups]="false" (contextChange)="openTickets($event)" />
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .ticket-landing { max-width: 64rem; }
    p { max-width: 68ch; color: var(--mat-sys-on-surface-variant); }
    .picker-heading { display: flex; align-items: center; gap: 0.5rem; margin-block-start: 1.5rem; }
    .picker-heading h2 { margin: 0; font: var(--mat-sys-title-medium); }
  `,
})
export class TicketAdminLandingPageComponent {
  private readonly router = inject(Router);

  protected openTickets(context: EventContextRef): void {
    void this.router.navigate(['/tickets', context.kind, context.id]);
  }
}
