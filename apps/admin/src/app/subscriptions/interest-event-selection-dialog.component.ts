import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';

export interface InterestEventSelectionItem {
  id: string;
  name: string;
  startDate: string;
}

export interface InterestEventSelectionDialogData {
  targetName: string;
  events: InterestEventSelectionItem[];
}

export interface InterestEventSelectionDialogResult {
  selectedEventIds: string[];
}

@Component({
  selector: 'app-interest-event-selection-dialog',
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatListModule],
  template: `
    <h2 mat-dialog-title>Escolher atividades para inscrição</h2>
    <div mat-dialog-content>
      <p>
        Selecione as atividades de <strong>{{ data.targetName }}</strong> que devem entrar nesta inscrição.
      </p>
      <p class="selection-note">
        A conversão não confirma pagamento nem aprovação; regras de vagas e análise continuam no fluxo de inscrições.
      </p>
      <mat-selection-list aria-label="Atividades para a inscrição">
        @for (event of data.events; track event.id) {
          <mat-list-option
            checkboxPosition="before"
            [selected]="selectedEventIds().has(event.id)"
            (selectedChange)="setSelected(event.id, $event)">
            <span matListItemTitle>{{ event.name }}</span>
            <span matListItemLine>{{ event.startDate | date: 'short' }}</span>
          </mat-list-option>
        } @empty {
          <mat-list-item>
            <span matListItemTitle>Nenhuma atividade disponível</span>
          </mat-list-item>
        }
      </mat-selection-list>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button
        mat-flat-button
        type="button"
        [disabled]="selectedEventIds().size === 0"
        (click)="confirm()">
        Continuar
      </button>
    </div>
  `,
  styles: [
    `
      p {
        margin: 0 0 0.75rem;
      }

      .selection-note {
        color: var(--mat-sys-on-surface-variant);
      }

      mat-selection-list {
        max-height: 22rem;
        overflow: auto;
      }
    `,
  ],
})
export class InterestEventSelectionDialogComponent {
  readonly selectedEventIds = signal<Set<string>>(new Set());
  readonly data = inject<InterestEventSelectionDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<InterestEventSelectionDialogComponent, InterestEventSelectionDialogResult>);

  setSelected(eventId: string, selected: boolean): void {
    this.selectedEventIds.update((ids) => {
      const next = new Set(ids);
      if (selected) {
        next.add(eventId);
      } else {
        next.delete(eventId);
      }
      return next;
    });
  }

  confirm(): void {
    this.dialogRef.close({ selectedEventIds: [...this.selectedEventIds()] });
  }
}
