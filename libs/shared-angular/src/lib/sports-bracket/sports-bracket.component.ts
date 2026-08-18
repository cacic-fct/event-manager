import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { SportsStageType } from '@cacic-fct/shared-data-types';
import { TwemojiComponent } from '../emoji/twemoji.component';
import { SportsLiveDotComponent } from '../sports-live-dot/sports-live-dot.component';
import { SportsTeamLogoComponent } from '../sports-team-logo/sports-team-logo.component';
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

interface SportsBracketConnectorPath {
  id: string;
  d: string;
}

interface SportsBracketConnectorLayout {
  width: number;
  height: number;
  paths: readonly SportsBracketConnectorPath[];
}

const EMPTY_CONNECTOR_LAYOUT: SportsBracketConnectorLayout = {
  width: 0,
  height: 0,
  paths: [],
};

@Component({
  selector: 'lib-sports-bracket',
  imports: [MatIconModule, SportsLiveDotComponent, SportsTeamLogoComponent, TwemojiComponent],
  templateUrl: './sports-bracket.component.html',
  styleUrl: './sports-bracket.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsBracketComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly format = input.required<SportsBracketFormat>();
  readonly emoji = input<string | null>(null);
  readonly stages = input<readonly SportsBracketStageView[]>([]);
  readonly standings = input<readonly SportsBracketStandingView[]>([]);
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
    () => this.stageLayouts().every((stage) => stage.rounds.length === 0) && this.orderedStandings().length === 0,
  );
  readonly connectorLayouts = signal<Readonly<Record<string, SportsBracketConnectorLayout>>>({});

  private resizeObserver: ResizeObserver | null = null;
  private measurementFrame: number | null = null;
  private readonly connectorMeasurementEffect = effect(() => {
    this.stageLayouts();
    this.scheduleConnectorMeasurement();
  });

  ngAfterViewInit(): void {
    if (!this.isBrowser() || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => this.scheduleConnectorMeasurement());
    this.resizeObserver.observe(this.host.nativeElement);
    this.scheduleConnectorMeasurement();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    const window = this.host.nativeElement.ownerDocument.defaultView;
    if (this.measurementFrame !== null) {
      window?.cancelAnimationFrame(this.measurementFrame);
      this.measurementFrame = null;
    }
  }

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

  connectorLayout(stageId: string): SportsBracketConnectorLayout {
    return this.connectorLayouts()[stageId] ?? EMPTY_CONNECTOR_LAYOUT;
  }

  private isEliminationStage(type: SportsStageType): boolean {
    return ['ELIMINATION', 'WINNERS_BRACKET', 'LOSERS_BRACKET', 'FINAL'].includes(type);
  }

  private roundLabel(stageType: SportsStageType, number: number, index: number, roundCount: number): string {
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

  private scheduleConnectorMeasurement(): void {
    if (!this.isBrowser() || this.measurementFrame !== null) {
      return;
    }

    const window = this.host.nativeElement.ownerDocument.defaultView;
    if (!window) {
      return;
    }

    this.measurementFrame = window.requestAnimationFrame(() => {
      this.measurementFrame = null;
      this.measureConnectorLayouts();
    });
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && this.host.nativeElement.ownerDocument.defaultView !== null;
  }

  private measureConnectorLayouts(): void {
    const tracks = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.round-track[data-stage-id]'));
    const layouts: Record<string, SportsBracketConnectorLayout> = {};

    for (const track of tracks) {
      this.resizeObserver?.observe(track);

      const stageId = track.dataset['stageId'];
      const stageType = track.dataset['stageType'] as SportsStageType | undefined;
      const trackRect = track.getBoundingClientRect();
      if (!stageId || trackRect.width === 0 || trackRect.height === 0) {
        continue;
      }

      const rounds = Array.from(track.querySelectorAll<HTMLElement>(':scope > .round-column')).map((column) => ({
        matches: Array.from(
          column.querySelectorAll<HTMLElement>(':scope > .round-matches > .match-slot[data-bracket-position]'),
        )
          .map((slot) => ({
            position: Number(slot.dataset['bracketPosition']),
            slot,
          }))
          .filter((match) => Number.isFinite(match.position))
          .sort((left, right) => left.position - right.position),
      }));
      const paths: SportsBracketConnectorPath[] = [];

      for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
        const targetMatches = new Map(rounds[roundIndex + 1].matches.map((match) => [match.position, match]));

        for (const source of rounds[roundIndex].matches) {
          const targetPosition = nextRoundPosition(
            stageType,
            source.position,
            rounds[roundIndex].matches.length,
            rounds[roundIndex + 1].matches.length,
          );
          const target = targetMatches.get(targetPosition);
          if (!target) {
            continue;
          }

          const sourceRect = source.slot.getBoundingClientRect();
          const targetRect = target.slot.getBoundingClientRect();
          const sourceX = sourceRect.right - trackRect.left;
          const targetX = targetRect.left - trackRect.left;
          const sourceY = sourceRect.top + sourceRect.height / 2 - trackRect.top;
          const targetY = targetRect.top + targetRect.height / 2 - trackRect.top;
          const junctionX = sourceX + (targetX - sourceX) / 2;

          paths.push({
            id: `${stageId}-${roundIndex}-${source.position}-${target.position}`,
            d: [
              `M ${formatConnectorNumber(sourceX)} ${formatConnectorNumber(sourceY)}`,
              `H ${formatConnectorNumber(junctionX)}`,
              `V ${formatConnectorNumber(targetY)}`,
              `H ${formatConnectorNumber(targetX)}`,
            ].join(' '),
          });
        }
      }

      layouts[stageId] = {
        width: trackRect.width,
        height: trackRect.height,
        paths,
      };
    }

    this.connectorLayouts.set(layouts);
  }
}

function formatConnectorNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function nextRoundPosition(
  stageType: SportsStageType | undefined,
  sourcePosition: number,
  sourceCount: number,
  targetCount: number,
): number {
  if (stageType === 'LOSERS_BRACKET' && sourceCount === targetCount) {
    return sourcePosition;
  }
  return Math.ceil(sourcePosition / 2);
}
