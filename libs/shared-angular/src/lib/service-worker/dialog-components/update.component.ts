import { Component, computed, input } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'lib-update-modal',
  imports: [MatDialogModule, MatIconModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title class="dialog-title">
      <mat-icon aria-hidden="true">system_update_alt</mat-icon>
      <span>{{ title() }}</span>
    </h2>
    <mat-dialog-content>
      <p role="status" aria-live="polite" aria-atomic="true">{{ message() }}</p>
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="title()" />
    </mat-dialog-content>
  `,
  styleUrl: './update-dialog.css',
})
export class UpdateModalComponent {
  readonly phase = input<'downloading' | 'ready'>('downloading');
  readonly title = computed(() => (this.phase() === 'ready' ? 'Atualização pronta' : 'Atualização do aplicativo'));
  readonly message = computed(() =>
    this.phase() === 'ready' ? 'Aguarde um instante.' : 'A página será recarregada automaticamente.',
  );
}
