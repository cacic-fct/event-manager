import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { FormField, disabled, form, maxLength } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MarkdownPreviewDialogComponent } from '@cacic-fct/shared-angular';
import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom } from 'rxjs';
import { GraphqlHttpService } from '../graphql/graphql-http.service';
import { PermissionsService } from '../permissions/permissions.service';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';
import { getErrorMessage } from '../feedback/error-message';

@Component({
  selector: 'app-event-subscriber-information',
  imports: [
    FormField,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatIconModule,
    MatTooltipModule,
  ],
  template: `
    <section aria-labelledby="subscriber-information-title">
      <h3 id="subscriber-information-title">Informações para inscritos</h3>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" aria-label="Carregando informações para inscritos" />
      } @else if (loadError()) {
        <p role="alert">Não foi possível carregar as informações.</p>
        <button mat-button type="button" (click)="load()">Tentar novamente</button>
      } @else {
        <mat-form-field>
          <mat-label>Links e orientações</mat-label>
          <textarea matInput rows="4" [formField]="fields.content"></textarea>
          <mat-hint>Markdown. Visível apenas para inscritos.</mat-hint>
          <button
            mat-icon-button
            matSuffix
            type="button"
            aria-label="Pré-visualizar informações para inscritos"
            matTooltip="Pré-visualizar"
            (click)="preview()">
            <mat-icon>preview</mat-icon>
          </button>
        </mat-form-field>
        <div class="actions">
          <mat-checkbox
            [checked]="notify()"
            (change)="notify.set($event.checked)"
            [disabled]="saving() || !canEdit() || !published()">
            Notificar inscritos
          </mat-checkbox>
          <button
            mat-flat-button
            type="button"
            (click)="save()"
            [disabled]="saving() || fields().invalid() || !canEdit() || (!changed() && !notify())">
            {{ saving() ? 'Publicando…' : 'Publicar informações' }}
          </button>
        </div>
        @if (!published()) {
          <p>Publique o evento para enviar notificações.</p>
        }
        @if (message()) {
          <p role="status">{{ message() }}</p>
        }
        @if (saveError()) {
          <p role="alert">{{ saveError() }}</p>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    section {
      display: grid;
      gap: 1rem;
    }
    h3 {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
    p {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    mat-form-field {
      width: 100%;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }
  `,
})
export class EventSubscriberInformationComponent {
  readonly eventId = input.required<string>();
  readonly editable = input(true);
  readonly published = input(true);
  private readonly api = inject(GraphqlHttpService);
  private readonly dialog = inject(MatDialog);
  private readonly permissions = inject(PermissionsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pending = inject(WorkspacePendingChangesService).register(() => {
    this.model.set({ content: this.original() });
    this.notify.set(false);
  });
  readonly canEdit = computed(() => this.editable() && this.permissions.canEdit(Permission.Event.Update));
  readonly model = signal({ content: '' });
  readonly fields = form(this.model, (schema) => {
    maxLength(schema.content, 10000);
    disabled(schema.content, () => !this.canEdit() || this.saving());
  });
  readonly original = signal('');
  readonly notify = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadError = signal(false);
  readonly saveError = signal('');
  readonly message = signal('');
  readonly changed = computed(() => this.model().content.trim() !== this.original());
  private request = 0;

  constructor() {
    effect(() => {
      this.eventId();
      void this.load();
    });
    effect(() => this.pending.set(this.changed() || this.saving()));
    this.destroyRef.onDestroy(() => {
      this.request++;
      this.pending.destroy();
    });
  }

  preview(): void {
    this.dialog.open(MarkdownPreviewDialogComponent, {
      data: { content: this.model().content, title: 'Pré-visualização das informações para inscritos' },
      maxWidth: 'calc(100vw - 32px)',
    });
  }

  async load(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.saving.set(false);
    this.loadError.set(false);
    this.message.set('');
    this.saveError.set('');
    this.notify.set(false);
    try {
      const result = await firstValueFrom(
        this.api.request<{ eventSubscriberInformation: { content: string | null } }>(
          `query EventSubscriberInformation($eventId: String!) {
          eventSubscriberInformation(eventId: $eventId) { content }
        }`,
          { eventId: this.eventId() },
        ),
      );
      if (request !== this.request) return;
      const content = result.eventSubscriberInformation?.content ?? '';
      this.original.set(content);
      this.model.set({ content });
    } catch {
      if (request === this.request) this.loadError.set(true);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.saving() || !this.canEdit() || this.fields().invalid()) return;
    const request = this.request;
    const eventId = this.eventId();
    const content = this.model().content.trim();
    const notifySubscribers = this.notify();
    this.saving.set(true);
    this.saveError.set('');
    this.message.set('');
    try {
      await firstValueFrom(
        this.api.request(
          `mutation UpdateEventSubscriberInformation($eventId: String!, $content: String, $notifySubscribers: Boolean!) {
          updateEventSubscriberInformation(eventId: $eventId, content: $content, notifySubscribers: $notifySubscribers) { content updatedAt }
        }`,
          { eventId, content: content || null, notifySubscribers },
        ),
      );
      if (request !== this.request) return;
      this.original.set(content);
      this.model.set({ content });
      this.notify.set(false);
      this.message.set(
        notifySubscribers && content
          ? 'Informações publicadas. Avisos agendados para os inscritos.'
          : 'Informações publicadas.',
      );
    } catch (error) {
      if (request === this.request) {
        this.saveError.set(getErrorMessage(error, 'Não foi possível concluir a publicação. Tente novamente.'));
      }
    } finally {
      if (request === this.request) this.saving.set(false);
    }
  }
}
