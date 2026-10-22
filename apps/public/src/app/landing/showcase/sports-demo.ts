import { Component, computed, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { MatchOperationsDemoComponent } from './match-operations-demo';
import { playShowcaseSequence } from './showcase-animation';

@Component({
  selector: 'app-landing-sports-demo',
  imports: [MatButtonModule, MatIconModule, TwemojiComponent, MatchOperationsDemoComponent],
  templateUrl: './sports-demo.html',
  styleUrl: './sports-demo.scss',
})
export class SportsDemoComponent {
  private readonly operations = viewChild(MatchOperationsDemoComponent);
  readonly sportsView = signal<'match' | 'standings' | 'operations'>('match');
  readonly matchScore = signal({ home: 2, away: 1 });
  readonly matchState = signal<'PAUSED' | 'LIVE' | 'ENDED'>('LIVE');
  readonly pulseActive = signal(false);
  readonly elapsedLabel = computed(() => this.operations()?.elapsedLabel() ?? '12:34');
  readonly matchStatus = computed(() => {
    switch (this.matchState()) {
      case 'LIVE':
        return 'Partida em andamento';
      case 'ENDED':
        return 'Partida encerrada';
      default:
        return 'Partida pausada';
    }
  });
  readonly teams = [
    { name: 'Compiladores', points: 7, played: 3 },
    { name: 'Algoritmos', points: 5, played: 3 },
    { name: 'Vetores', points: 3, played: 3 },
  ];

  constructor() {
    playShowcaseSequence(
      () => {
        this.pulseActive.set(true);
        return () => this.pulseActive.set(false);
      },
      () => this.sportsView() === 'match' && this.matchState() === 'LIVE',
    );
  }

  selectSportsView(view: 'match' | 'standings' | 'operations'): void {
    this.sportsView.set(view);
  }
}
