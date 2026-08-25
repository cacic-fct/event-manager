import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type AdminErrorDialogData = {
  title: string;
  message: string;
};

@Component({
  selector: 'app-admin-error-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <div class="error-dialog-heading">
      <mat-icon aria-hidden="true">error</mat-icon>
      <h2 mat-dialog-title>{{ data.title }}</h2>
    </div>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      <p class="error-dialog-guidance">
        Revise os dados e tente novamente. Se o problema continuar, contate o suporte.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close cdkFocusInitial type="button">Entendi</button>
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
      max-width: 36rem;
    }

    .error-dialog-heading {
      align-items: center;
      color: var(--mat-sys-error);
      display: flex;
      gap: 0.75rem;
      padding: 1.5rem 1.5rem 0;
    }

    .error-dialog-heading h2 {
      padding: 0;
    }

    mat-dialog-content p {
      overflow-wrap: anywhere;
    }

    .error-dialog-guidance {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AdminErrorDialogComponent {
  protected readonly data = inject<AdminErrorDialogData>(MAT_DIALOG_DATA);
}
