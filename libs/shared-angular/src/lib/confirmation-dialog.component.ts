import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmationDialogData {
  title: string;
  message?: string;
  actionDescription?: string;
  details?: readonly string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

@Component({
  selector: 'lib-confirmation-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title class="dialog-title" [class.danger]="data.tone === 'danger'">
      @if (data.tone === 'danger') {
        <mat-icon>warning</mat-icon>
      }
      <span>{{ data.title }}</span>
    </h2>
    <div mat-dialog-content class="dialog-content">
      <p>{{ data.message ?? defaultMessage }}</p>

      @if (data.details?.length) {
        <ul>
          @for (detail of data.details; track detail) {
            <li>{{ detail }}</li>
          }
        </ul>
      }
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">
        {{ data.cancelLabel ?? 'Cancelar' }}
      </button>
      <button mat-flat-button type="button" [class.danger-action]="data.tone === 'danger'" [mat-dialog-close]="true">
        {{ data.confirmLabel ?? 'Confirmar' }}
      </button>
    </div>
  `,
  styles: `
    .dialog-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .dialog-title.danger mat-icon {
      color: var(--mat-sys-error);
    }

    .dialog-content {
      display: grid;
      gap: 0.75rem;
      max-width: 52ch;
    }

    .dialog-content p,
    .dialog-content ul {
      margin: 0;
    }

    .dialog-content p {
      color: var(--mat-sys-on-surface-variant);
      line-height: 1.5;
    }

    .dialog-content ul {
      padding-inline-start: 1.25rem;
    }

    .danger-action {
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
    }
  `,
})
export class ConfirmationDialogComponent {
  readonly data = inject<ConfirmationDialogData>(MAT_DIALOG_DATA);

  get defaultMessage(): string {
    return `Confirme para continuar com ${this.data.actionDescription ?? 'essa ação'}.`;
  }
}
