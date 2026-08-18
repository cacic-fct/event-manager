import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { SportsTimerSnapshot } from './sports-operations.types';

export interface SportsTimerConflictDialogData {
  server: SportsTimerSnapshot;
  device: SportsTimerSnapshot;
}

@Component({
  selector: 'app-sports-timer-conflict-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Qual cronômetro deve ser mantido?</h2>
    <mat-dialog-content>
      <p>A partida também foi alterada em outro dispositivo. Compare os horários antes de continuar.</p>
      <div class="choices">
        <section>
          <mat-icon aria-hidden="true">cloud</mat-icon>
          <div>
            <strong>Servidor</strong><span>Geral: {{ overall(data.server) }}</span
            ><span>{{ period(data.server) }}</span>
          </div>
        </section>
        <section>
          <mat-icon aria-hidden="true">smartphone</mat-icon>
          <div>
            <strong>Este dispositivo</strong><span>Geral: {{ overall(data.device) }}</span
            ><span>{{ period(data.device) }}</span>
          </div>
        </section>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="choose('SERVER')">Manter servidor</button>
      <button mat-flat-button type="button" (click)="choose('DEVICE')">Manter este dispositivo</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content > p {
      color: var(--mat-sys-on-surface-variant);
    }
    .choices {
      display: grid;
      gap: 0.75rem;
      margin-block: 1rem;
    }
    section {
      display: flex;
      align-items: start;
      gap: 0.75rem;
      padding: 1rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
    }
    section div {
      display: grid;
      gap: 0.2rem;
    }
    section span {
      color: var(--mat-sys-on-surface-variant);
      font-variant-numeric: tabular-nums;
    }
    @media (max-width: 480px) {
      mat-dialog-actions {
        display: grid;
      }
      mat-dialog-actions button {
        width: 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsTimerConflictDialog {
  readonly data = inject<SportsTimerConflictDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<SportsTimerConflictDialog, 'SERVER' | 'DEVICE'>>(MatDialogRef);

  choose(value: 'SERVER' | 'DEVICE'): void {
    this.ref.close(value);
  }

  overall(snapshot: SportsTimerSnapshot): string {
    return this.format(snapshot.overall.elapsedBeforePauseMs + this.running(snapshot.overall.startedAtUnixMs));
  }

  period(snapshot: SportsTimerSnapshot): string {
    const timer = snapshot.periods.find((candidate) => candidate.periodNumber === snapshot.activePeriod);
    return timer
      ? `Período ${timer.periodNumber}: ${this.format(timer.elapsedBeforePauseMs + this.running(timer.startedAtUnixMs))}`
      : 'Sem período ativo';
  }

  private running(startedAtUnixMs: number | null | undefined): number {
    return startedAtUnixMs == null ? 0 : Math.max(0, Date.now() - startedAtUnixMs);
  }

  private format(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}
