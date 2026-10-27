import { Component, DestroyRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormField, disabled, form, maxLength } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MarkdownPreviewDialogComponent } from '@cacic-fct/shared-angular';
import { EventMaterialsComponent, EventPreparationApiService } from '@cacic-fct/shared-angular/event-preparation';
import { Permission } from '@cacic-fct/shared-permissions';
import type { EventPreparation } from '@cacic-fct/shared-event-preparation';
import { PermissionsService } from '../permissions/permissions.service';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';
import { EventManualNotificationComponent } from './event-manual-notification.component';

@Component({
  selector: 'app-event-preparation',
  imports: [
    FormField,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    EventMaterialsComponent,
    EventManualNotificationComponent,
  ],
  template: `
    <section aria-labelledby="event-preparation-title">
      <h3 id="event-preparation-title">Orientações para a equipe</h3>
      <p>Informações deste evento. Use Markdown para compartilhar contato da organização, equipamentos e instruções.</p>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" aria-label="Carregando orientações da equipe" />
      } @else if (loadError()) {
        <p role="alert">Não foi possível carregar as orientações.</p>
        <button mat-button type="button" (click)="load()">Tentar novamente</button>
      } @else {
        <form (submit)="$event.preventDefault(); save()">
          <mat-form-field>
            <mat-label>Orientações para palestrantes e ministrantes</mat-label>
            <textarea matInput rows="5" [formField]="fields.lecturerInformation"></textarea>
            <mat-hint>Visíveis somente aos ministrantes vinculados a este evento e à organização.</mat-hint>
          </mat-form-field>
          <button mat-button type="button" (click)="preview('lecturerInformation')">
            Pré-visualizar para palestrantes
          </button>
          <mat-form-field>
            <mat-label>Orientações para coletores de presença</mat-label>
            <textarea matInput rows="5" [formField]="fields.collectorInformation"></textarea>
            <mat-hint>Exibidas nas telas de coleta de presença.</mat-hint>
          </mat-form-field>
          <button mat-button type="button" (click)="preview('collectorInformation')">
            Pré-visualizar para coletores
          </button>
          <div class="actions">
            <button
              mat-flat-button
              type="submit"
              [disabled]="!canEdit() || saving() || !changed() || fields().invalid()">
              {{ saving() ? 'Salvando…' : 'Salvar orientações' }}
            </button>
            @if (changed()) {
              <button mat-button type="button" (click)="discard()" [disabled]="saving()">Descartar alterações</button>
            }
          </div>
          @if (message()) {
            <p role="status">{{ message() }}</p>
          }
          @if (error()) {
            <p role="alert">{{ error() }}</p>
            <button mat-button type="button" (click)="load()" [disabled]="saving()">Recarregar orientações</button>
          }
        </form>
      }
    </section>
    <section>
      <lib-event-materials
        [eventId]="eventId()"
        [editable]="canEdit()"
        [management]="true"
        (dirtyChange)="materialsDirty.set($event)" />
    </section>
    <section>
      <app-event-manual-notification
        [eventId]="eventId()"
        [eventName]="eventName()"
        [editable]="canEdit()"
        [published]="published()" />
    </section>
  `,
  styles: `
    :host {
      display: grid;
      gap: 1.5rem;
      min-width: 0;
    }
    section {
      display: grid;
      gap: 1rem;
    }
    section + section {
      border-top: 1px solid var(--mat-sys-outline-variant);
      padding-top: 1.5rem;
    }
    h3,
    p {
      margin: 0;
    }
    h3 {
      font: var(--mat-sys-title-medium);
    }
    p {
      color: var(--mat-sys-on-surface-variant);
      max-width: 70ch;
    }
    form {
      display: grid;
      gap: 1rem;
    }
    mat-form-field {
      width: 100%;
    }
    form > button {
      justify-self: start;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
  `,
})
export class EventPreparationComponent {
  readonly eventId = input.required<string>();
  readonly eventName = input('');
  readonly editable = input(false);
  readonly published = input(false);
  private readonly api = inject(EventPreparationApiService);
  private readonly dialog = inject(MatDialog);
  private readonly permissions = inject(PermissionsService);
  readonly canEdit = computed(() => this.editable() && this.permissions.canEdit(Permission.Event.Update));
  readonly model = signal({ lecturerInformation: '', collectorInformation: '' });
  readonly fields = form(this.model, (schema) => {
    maxLength(schema.lecturerInformation, 10000);
    maxLength(schema.collectorInformation, 10000);
    disabled(schema, () => !this.canEdit() || this.saving());
  });
  readonly original = signal<EventPreparation>({
    lecturerInformation: null,
    collectorInformation: null,
    updatedAt: null,
  });
  readonly changed = computed(
    () =>
      (this.model().lecturerInformation.trim() || null) !== this.original().lecturerInformation ||
      (this.model().collectorInformation.trim() || null) !== this.original().collectorInformation,
  );
  readonly materialsDirty = signal(false);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  private request = 0;
  private readonly materials = viewChild(EventMaterialsComponent);
  private readonly pending = inject(WorkspacePendingChangesService).register(() => {
    this.discard();
    this.materials()?.discard();
  });

  constructor() {
    effect(() => {
      this.eventId();
      untracked(() => void this.load());
    });
    effect(() => this.pending.set(this.changed() || this.saving() || this.materialsDirty()));
    inject(DestroyRef).onDestroy(() => {
      this.request++;
      this.pending.destroy();
    });
  }
  discard(): void {
    this.model.set({
      lecturerInformation: this.original().lecturerInformation ?? '',
      collectorInformation: this.original().collectorInformation ?? '',
    });
  }
  preview(field: 'lecturerInformation' | 'collectorInformation'): void {
    this.dialog.open(MarkdownPreviewDialogComponent, {
      data: { title: 'Pré-visualização das orientações', content: this.model()[field] },
      maxWidth: 'calc(100vw - 32px)',
    });
  }
  async load(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.saving.set(false);
    this.loadError.set(false);
    this.message.set('');
    this.error.set('');
    this.original.set({ lecturerInformation: null, collectorInformation: null, updatedAt: null });
    this.discard();
    try {
      const result = await this.api.getPreparation(this.eventId());
      if (request !== this.request) return;
      this.original.set(result);
      this.discard();
    } catch {
      if (request === this.request) this.loadError.set(true);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
  async save(): Promise<void> {
    if (!this.canEdit() || this.saving() || !this.changed() || this.fields().invalid()) return;
    const request = this.request;
    this.saving.set(true);
    this.message.set('');
    this.error.set('');
    try {
      const result = await this.api.savePreparation(this.eventId(), {
        ...this.model(),
        updatedAt: this.original().updatedAt,
      });
      if (request !== this.request) return;
      this.original.set(result);
      this.discard();
      this.message.set('Orientações salvas. Para enviar um aviso, use a seção de notificações.');
    } catch (error) {
      if (request === this.request)
        this.error.set(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      if (request === this.request) this.saving.set(false);
    }
  }
}
