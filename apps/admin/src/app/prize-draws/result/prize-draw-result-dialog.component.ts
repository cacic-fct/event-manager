import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PrizeDrawSpinResult } from '@cacic-fct/event-manager-admin-contracts';
import { PrizeDrawConfettiComponent } from './prize-draw-confetti.component';
import { PrizeDrawQrCodeComponent } from './prize-draw-qr-code.component';

export type PrizeDrawResultDialogData = {
  result: PrizeDrawSpinResult;
  reducedMotion: boolean;
  publicDrawUrl: string;
};

@Component({
  selector: 'app-prize-draw-result-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule, PrizeDrawConfettiComponent, PrizeDrawQrCodeComponent],
  template: `
    <section class="result-stage">
      <app-prize-draw-confetti [reducedMotion]="data.reducedMotion" />
      <div class="result-content">
        @if (data.result.demo) {
          <span class="demo-label"><mat-icon>science</mat-icon> Demonstração</span>
        }
        <mat-icon class="result-icon" aria-hidden="true">celebration</mat-icon>
        <p class="draw-title">{{ data.result.drawTitle }}</p>
        @if (data.result.spinDescription) {
          <p class="spin-description">{{ data.result.spinDescription }}</p>
        }
        <h2 mat-dialog-title>{{ data.result.winnerFullName }}</h2>
        <p class="result-message">Nome sorteado</p>
        <a
          class="result-qr-link"
          [href]="data.publicDrawUrl"
          target="_blank"
          rel="noopener"
          aria-label="Abrir página pública do sorteio">
          <app-prize-draw-qr-code [value]="data.publicDrawUrl" />
        </a>
      </div>
      <div mat-dialog-actions>
        <button mat-flat-button type="button" cdkFocusInitial [mat-dialog-close]="true">
          <mat-icon>close</mat-icon>
          Fechar resultado
        </button>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .result-stage {
      position: relative;
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      min-height: 100%;
      overflow: hidden;
      background: var(--mat-sys-surface);
    }
    .result-content {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      place-content: center;
      justify-items: center;
      gap: 0.5rem;
      box-sizing: border-box;
      min-height: 0;
      width: 100%;
      padding: 2rem;
      overflow: auto;
      text-align: center;
    }
    .result-icon {
      width: 3rem;
      height: 3rem;
      font-size: 3rem;
      color: var(--mat-sys-primary);
    }
    .draw-title,
    .spin-description,
    .result-message {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .draw-title {
      font: var(--mat-sys-title-large);
    }
    .spin-description {
      max-width: 52ch;
    }
    h2 {
      width: 100%;
      max-width: 64rem;
      margin: 0.5rem 0 0;
      font-size: clamp(2.4rem, 8vw, 6rem);
      font-weight: 700;
      line-height: 0.98;
      letter-spacing: -0.035em;
      overflow-wrap: anywhere;
      text-wrap: balance;
    }
    .result-message {
      font: var(--mat-sys-title-medium);
    }
    .result-qr-link {
      display: block;
      margin: 1.25rem 0 0.75rem;
      border-radius: 12px;
    }
    .result-qr-link:focus-visible {
      outline: 3px solid var(--mat-sys-primary);
      outline-offset: 4px;
    }
    .demo-label {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.65rem;
      border-radius: 999px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      font: var(--mat-sys-label-large);
    }
    .demo-label mat-icon {
      width: 1.2rem;
      height: 1.2rem;
      font-size: 1.2rem;
    }
    [mat-dialog-actions] {
      position: relative;
      z-index: 1;
      justify-content: center;
      padding: 1rem 1rem 1.5rem;
    }
    @media (max-height: 600px) and (orientation: landscape) {
      .result-content {
        grid-template-columns: minmax(0, 1fr) auto;
        align-content: center;
        column-gap: 1.5rem;
        padding: 1rem 2rem;
      }
      .result-content > :not(.result-qr-link) {
        grid-column: 1;
      }
      .result-qr-link {
        grid-column: 2;
        grid-row: 1 / span 7;
        margin: 0;
        align-self: center;
      }
      h2 {
        font-size: clamp(2rem, 8vh, 4rem);
      }
      [mat-dialog-actions] {
        padding: 0.5rem 1rem 0.75rem;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      h2 {
        letter-spacing: -0.02em;
      }
    }
  `,
})
export class PrizeDrawResultDialogComponent {
  readonly data = inject<PrizeDrawResultDialogData>(MAT_DIALOG_DATA);
}
