import { Component, computed, input } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

export interface UpdateProgress {
  completed: number;
  total: number;
}

@Component({
  selector: 'lib-update-modal',
  imports: [MatDialogModule, MatIconModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title class="dialog-title">
      <mat-icon aria-hidden="true">system_update_alt</mat-icon>
      <span>{{ title() }}</span>
    </h2>
    <mat-dialog-content>
      <p role="status">{{ message() }}</p>
      @if (phase() === 'downloading') {
        @if (progressLabel(); as label) {
          <p class="file-count" aria-hidden="true">{{ label }}</p>
          <mat-progress-bar
            mode="determinate"
            [value]="progressPercent()"
            aria-label="Preparação dos arquivos da atualização"
            [attr.aria-valuetext]="label" />
        }
        @if (takingLonger()) {
          <p class="slow-update" role="status">Em conexões lentas, esta etapa pode demorar.</p>
        }
      }
    </mat-dialog-content>
  `,
  styleUrl: './update-dialog.css',
})
export class UpdateModalComponent {
  readonly phase = input<'downloading' | 'ready'>('downloading');
  readonly progress = input<UpdateProgress | null>(null);
  readonly takingLonger = input(false);
  readonly title = computed(() => (this.phase() === 'ready' ? 'Finalizando atualização' : 'Atualização do aplicativo'));
  readonly message = computed(() =>
    this.phase() === 'ready'
      ? 'A página será recarregada em instantes.'
      : 'Preparando os arquivos da nova versão. A página será recarregada automaticamente.',
  );
  readonly progressLabel = computed(() => {
    const progress = this.progress();
    if (!progress) return null;

    const { completed, total } = progress;
    return total === 1 ? `${completed} de ${total} arquivo preparado` : `${completed} de ${total} arquivos preparados`;
  });
  readonly progressPercent = computed(() => {
    const progress = this.progress();
    return progress ? (100 * progress.completed) / progress.total : 0;
  });
}
