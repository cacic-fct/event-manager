import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MarkdownComponent } from './markdown.component';

export interface MarkdownPreviewDialogData {
  content: string;
  title?: string;
}

@Component({
  selector: 'lib-markdown-preview-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MarkdownComponent],
  template: `
    <h2 mat-dialog-title>{{ data.title || 'Pré-visualização da descrição' }}</h2>
    <mat-dialog-content>
      @if (data.content.trim()) {
        <lib-markdown [content]="data.content" />
      } @else {
        <p class="empty-preview">A descrição está vazia.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">Fechar</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      min-height: 8rem;
      width: min(42rem, 80vw);
    }

    .empty-preview {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }

    @media (max-width: 600px) {
      mat-dialog-content {
        width: auto;
      }
    }
  `,
})
export class MarkdownPreviewDialogComponent {
  protected readonly data = inject<MarkdownPreviewDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<MarkdownPreviewDialogComponent>);
}
