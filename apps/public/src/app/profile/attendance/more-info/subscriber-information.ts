import { NgTemplateOutlet } from '@angular/common';
import { MatExpansionModule } from '@angular/material/expansion';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Component, DestroyRef, inject, input, signal, effect } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MarkdownComponent } from '@cacic-fct/shared-angular';
import { firstValueFrom, map, of } from 'rxjs';
import { AttendancesApiService } from '../attendances-api.service';

@Component({
  selector: 'app-subscriber-information',
  imports: [MatButtonModule, MatProgressBarModule, MatExpansionModule, NgTemplateOutlet, MarkdownComponent],
  template: `
    <ng-template #guidance>
      @if (error()) {
        <p role="alert">Não foi possível carregar as orientações de participação.</p>
        <button mat-button type="button" (click)="load()">Tentar novamente</button>
      } @else if (content()) {
        <section [attr.aria-labelledby]="'subscriber-information-' + eventId()">
          <h2 [id]="'subscriber-information-' + eventId()">Orientações{{ eventName() ? ': ' + eventName() : '' }}</h2>
          <lib-markdown [content]="content()" />
        </section>
      }
      @for (entry of entries(); track entry.eventId) {
        <section [attr.aria-labelledby]="'subscriber-information-' + entry.eventId">
          <h2 [id]="'subscriber-information-' + entry.eventId">Orientações: {{ entry.name }}</h2>
          <lib-markdown [content]="entry.content" />
        </section>
      }
    </ng-template>
    @if (!loading() && (content() || entries().length || error())) {
      @if (collapsible()) {
        <mat-expansion-panel [expanded]="expanded()">
          <mat-expansion-panel-header>
            <mat-panel-title>Orientações</mat-panel-title>
          </mat-expansion-panel-header>
          <ng-template matExpansionPanelContent>
            <ng-container [ngTemplateOutlet]="guidance" />
          </ng-template>
        </mat-expansion-panel>
      } @else {
        <ng-container [ngTemplateOutlet]="guidance" />
      }
    } @else if (loading() && !collapsible()) {
      <mat-progress-bar mode="indeterminate" aria-label="Carregando orientações de participação" />
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    mat-expansion-panel {
      margin-block: 12px;
    }
    mat-panel-title {
      font: var(--mat-sys-title-medium);
    }
    section {
      margin-block: 1.5rem;
    }
    h2 {
      font: var(--mat-sys-title-large);
      margin-block: 0 1rem;
    }
  `,
})
export class SubscriberInformation {
  readonly eventId = input('');
  readonly events = input<readonly { event: { id: string; name: string } }[]>([]);
  readonly eventName = input('');
  readonly collapsible = input(false);
  readonly expanded = input(false);
  private readonly api = inject(AttendancesApiService);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly informationRevision = toSignal(
    this.route?.queryParamMap?.pipe(map((params) => params.get('informationRevision'))) ?? of(null),
  );
  private readonly destroyRef = inject(DestroyRef);
  readonly content = signal<string | null>(null);
  readonly entries = signal<{ eventId: string; name: string; content: string }[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  private request = 0;

  constructor() {
    effect(() => {
      this.eventId();
      this.events();
      this.informationRevision();
      void this.load();
    });
    this.destroyRef.onDestroy(() => this.request++);
  }

  async load(): Promise<void> {
    const request = ++this.request;
    this.content.set(null);
    this.entries.set([]);
    this.loading.set(true);
    this.error.set(false);
    try {
      if (this.eventId()) {
        const content = await firstValueFrom(this.api.getSubscriberInformation(this.eventId()));
        if (request === this.request) this.content.set(content?.trim() || null);
      } else if (this.events().length) {
        const names = new Map(this.events().map(({ event }) => [event.id, event.name]));
        const entries = await firstValueFrom(this.api.getSubscriberInformationForEvents([...names.keys()]));
        if (request === this.request)
          this.entries.set(
            entries.flatMap((entry) =>
              entry.content?.trim()
                ? [{ eventId: entry.eventId, name: names.get(entry.eventId) ?? '', content: entry.content }]
                : [],
            ),
          );
      }
    } catch {
      if (request === this.request) this.error.set(true);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
