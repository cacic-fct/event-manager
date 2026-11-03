import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { EventInstructionsComponent } from './event-instructions.component';
import { EventPreparationApiService } from './event-preparation-api.service';

@Component({
  selector: 'lib-collector-instructions',
  imports: [MatButtonModule, EventInstructionsComponent],
  template: `
    @if (error()) {
      <p role="alert">Não foi possível carregar as orientações para coleta.</p>
      <button mat-button type="button" (click)="load()">Tentar novamente</button>
    } @else {
      <lib-event-instructions title="Orientações para coleta" [content]="content()" />
    }
  `,
})
export class CollectorInstructionsComponent {
  readonly eventId = input.required<string>();
  private readonly api = inject(EventPreparationApiService);
  readonly content = signal<string | null>(null);
  readonly error = signal(false);
  private request = 0;
  constructor() {
    effect(() => {
      this.eventId();
      void this.load();
    });
    inject(DestroyRef).onDestroy(() => this.request++);
  }
  async load(): Promise<void> {
    const request = ++this.request;
    const eventId = this.eventId();
    this.content.set(null);
    this.error.set(false);
    if (!eventId) return;
    try {
      const content = await this.api.getCollectorInformation(eventId);
      if (request === this.request) this.content.set(content);
    } catch {
      if (request === this.request) this.error.set(true);
    }
  }
}
