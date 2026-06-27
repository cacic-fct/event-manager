import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { Event, EventDraft } from '@cacic-fct/event-manager-admin-contracts';

export type EventDraftSelectorResult =
  | { kind: 'original' }
  | { kind: 'draft'; draft: EventDraft };

export type EventDraftSelectorDialogData = {
  event: Event;
  drafts: EventDraft[];
};

@Component({
  selector: 'app-event-draft-selector-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatIconModule, MatListModule],
  template: `
    <h2 mat-dialog-title>Escolher versão para edição</h2>
    <mat-dialog-content>
      <p class="dialog-note">
        Este evento tem rascunhos salvos. Escolha se deseja editar a versão publicada ou continuar a partir de um
        rascunho.
      </p>

      <mat-action-list>
        <button mat-list-item type="button" (click)="selectOriginal()">
          <mat-icon matListItemIcon>public</mat-icon>
          <span matListItemTitle>Evento publicado</span>
          <span matListItemLine>{{ originalSummary() }}</span>
        </button>

        @for (draft of data.drafts; track draft.id) {
          <button mat-list-item type="button" (click)="selectDraft(draft)">
            <mat-icon matListItemIcon>edit_note</mat-icon>
            <span matListItemTitle>Rascunho: {{ draft.name }}</span>
            <span matListItemLine>
              Editado em {{ draft.updatedAt | date: 'short' }} por {{ draft.updatedByName || draft.createdByName || 'usuário não identificado' }}
            </span>
            <span matListItemLine>
              Criado em {{ draft.createdAt | date: 'short' }} por {{ draft.createdByName || 'usuário não identificado' }}
            </span>
          </button>
        }
      </mat-action-list>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .dialog-note {
      max-width: 56ch;
      margin: 0 0 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }

    mat-action-list {
      min-width: min(34rem, 80vw);
    }

    button[mat-list-item] {
      height: auto;
      min-height: 4.75rem;
      padding-block: 0.5rem;
    }
  `,
})
export class EventDraftSelectorDialogComponent {
  readonly data = inject<EventDraftSelectorDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<EventDraftSelectorDialogComponent, EventDraftSelectorResult>>(
    MatDialogRef,
  );

  readonly originalSummary = computed(() => {
    const event = this.data.event;
    if (event.publicationState === 'PUBLISHED' && event.publishedAt) {
      return `Publicado em ${new Date(event.publishedAt).toLocaleString('pt-BR')}`;
    }

    return `Última atualização em ${new Date(event.updatedAt).toLocaleString('pt-BR')}`;
  });

  selectOriginal(): void {
    this.dialogRef.close({ kind: 'original' });
  }

  selectDraft(draft: EventDraft): void {
    this.dialogRef.close({ kind: 'draft', draft });
  }
}
