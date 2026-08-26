import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import {
  createPrizeDrawSpinResultStory,
  PRIZE_DRAW_STORY_PUBLIC_URL,
  prizeDrawStoryFullNames,
} from '../prize-draw-story.fixtures';
import { PrizeDrawResultDialogComponent, PrizeDrawResultDialogData } from './prize-draw-result-dialog.component';

@Component({
  selector: 'app-prize-draw-result-dialog-story-harness',
  imports: [MatButtonModule],
  template: `
    <main class="story-launcher">
      <h1>Revelação do resultado</h1>
      <p>O nome completo e o confete aparecem somente depois que o carretel termina.</p>
      <button mat-flat-button type="button" (click)="open()">Abrir resultado em tela cheia</button>
    </main>
  `,
  styles: `
    .story-launcher {
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 0.75rem;
      min-height: 100vh;
      padding: 2rem;
      text-align: center;
      background: var(--mat-sys-surface-container-low);
    }
    h1,
    p {
      margin: 0;
    }
    p {
      max-width: 58ch;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class PrizeDrawResultDialogStoryHarness {
  readonly winnerFullName = input(prizeDrawStoryFullNames[2]);
  readonly drawTitle = input('Sorteio de boas-vindas');
  readonly spinDescription = input('Camiseta do evento');
  readonly demo = input(false);
  readonly reducedMotion = input(false);
  private readonly dialog = inject(MatDialog);

  open(): void {
    const result = createPrizeDrawSpinResultStory({
      speed: 'INSTANT',
      winnerFullName: this.winnerFullName(),
      demo: this.demo(),
    });
    this.dialog.open<PrizeDrawResultDialogComponent, PrizeDrawResultDialogData, boolean>(
      PrizeDrawResultDialogComponent,
      {
        data: {
          result: {
            ...result,
            drawTitle: this.drawTitle(),
            spinDescription: this.spinDescription() || null,
          },
          reducedMotion: this.reducedMotion(),
          publicDrawUrl: PRIZE_DRAW_STORY_PUBLIC_URL,
        },
        width: '100vw',
        height: '100dvh',
        maxWidth: '100vw',
        maxHeight: '100dvh',
        autoFocus: 'dialog',
        restoreFocus: true,
      },
    );
  }
}
