import { Component } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  standalone: true,
  selector: 'lib-update-modal',
  imports: [MatProgressBarModule],
  template: `
    <div class="update-dialog">
      <h1>Instalando atualização</h1>

      <p>Não recarregue a página</p>

      <mat-progress-bar mode="indeterminate" />
    </div>
  `,
  styles: `
    .update-dialog {
      min-width: min(420px, 80vw);
      text-align: center;
      padding: 24px;
    }

    h1 {
      margin: 0 0 12px;
      font-size: 1.5rem;
      font-weight: 500;
    }

    p {
      margin: 0 0 24px;
      color: var(--mat-sys-on-surface-variant);
    }

    mat-progress-bar {
      width: 100%;
    }
  `,
})
export class UpdateModalComponent {}
