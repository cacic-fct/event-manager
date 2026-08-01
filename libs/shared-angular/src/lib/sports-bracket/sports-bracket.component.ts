import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { SportsStageType } from '@cacic-fct/shared-data-types';
import { TwemojiComponent } from '../emoji/twemoji.component';
import {
  SportsBracketFormat,
  SportsBracketMatchView,
  SportsBracketStageView,
  SportsBracketStandingView,
  sportsBracketFormatLabel,
  sportsBracketMatchStateLabel,
  sportsBracketStageLabel,
} from './sports-bracket.models';

interface SportsBracketRoundView {
  number: number;
  label: string;
  matches: readonly SportsBracketMatchView[];
}

interface SportsBracketStageLayout {
  id: string;
  name: string;
  type: SportsStageType;
  rounds: readonly SportsBracketRoundView[];
  elimination: boolean;
}

@Component({
  selector: 'lib-sports-bracket',
  imports: [TwemojiComponent],
  templateUrl: './sports-bracket.component.html',
  styleUrl: './sports-bracket.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsBracketComponent {
  readonly format = input.required<SportsBracketFormat>();
  readonly emoji = input<string | null>(null);
  readonly stages = input<readonly SportsBracketStageView[]>([]);
  readonly standings = input<readonly SportsBracketStandingView[]>([]);
  readonly currentMatchId = input<string | null>(null);
  readonly editingMatchId = input<string | null>(null);
  readonly matchSelected = output<string>();

  readonly formatLabel = computed(() => sportsBracketFormatLabel(this.format()));
  readonly stageLayouts = computed<SportsBracketStageLayout[]>(() =>
    [...this.stages()]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((stage) => {
        const matches = [...stage.matches].sort(
          (left, right) =>
            (left.roundNumber ?? 1) - (right.roundNumber ?? 1) ||
            (left.bracketPosition ?? 0) - (right.bracketPosition ?? 0) ||
            left.id.localeCompare(right.id),
        );
        const grouped = new Map<number, SportsBracketMatchView[]>();
        for (const match of matches) {
          const round = match.roundNumber ?? 1;
          grouped.set(round, [...(grouped.get(round) ?? []), match]);
        }
        const roundNumbers = [...grouped.keys()].sort((left, right) => left - right);
        return {
          id: stage.id,
          name: stage.name,
          type: stage.type,
          elimination: this.isEliminationStage(stage.type),
          rounds: roundNumbers.map((number, index) => ({
            number,
            label: this.roundLabel(stage.type, number, index, roundNumbers.length),
            matches: grouped.get(number) ?? [],
          })),
        };
      }),
  );
  readonly orderedStandings = computed(() =>
    [...this.standings()].sort(
      (left, right) =>
        (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) ||
        right.points - left.points ||
        left.team.name.localeCompare(right.team.name),
    ),
  );
  readonly isEmpty = computed(
    () =>
      this.stageLayouts().every((stage) => stage.rounds.length === 0) &&
      this.orderedStandings().length === 0,
  );

  stageLabel(type: SportsStageType): string {
    return sportsBracketStageLabel(type);
  }

  stateLabel(match: SportsBracketMatchView): string {
    return sportsBracketMatchStateLabel(match.state);
  }

  teamName(team: SportsBracketMatchView['homeTeam']): string {
    return team?.name ?? 'Livre';
  }

  showScore(match: SportsBracketMatchView): boolean {
    return !['SCHEDULED', 'CHECK_IN', 'CANCELED'].includes(match.state);
  }

  selectMatch(matchId: string): void {
    this.matchSelected.emit(matchId);
  }

  private isEliminationStage(type: SportsStageType): boolean {
    return ['ELIMINATION', 'WINNERS_BRACKET', 'LOSERS_BRACKET', 'FINAL'].includes(type);
  }

  private roundLabel(
    stageType: SportsStageType,
    number: number,
    index: number,
    roundCount: number,
  ): string {
    if (!this.isEliminationStage(stageType)) {
      return `Rodada ${number}`;
    }
    const remaining = roundCount - index;
    if (remaining === 1) {
      return 'Final';
    }
    if (remaining === 2) {
      return 'Semifinais';
    }
    if (remaining === 3) {
      return 'Quartas de final';
    }
    if (remaining === 4) {
      return 'Oitavas de final';
    }
    return `Rodada ${number}`;
  }
}
