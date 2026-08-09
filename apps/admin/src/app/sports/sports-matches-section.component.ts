import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  SportsBracketComponent,
  SportsMatchOverlayBuilderComponent,
  SportsTeamLogoComponent,
  TwemojiComponent,
} from '@cacic-fct/shared-angular';
import type { SportsBracketStageView, SportsBracketTeamView, SportsBracketMatchView } from '@cacic-fct/shared-angular';
import type { SportsCategoryRead, SportsCategorySummary } from './sports.models';
import { SportsWorkspaceSection } from './sports-workspace-section.base';

@Component({
  selector: 'app-sports-matches-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    SportsBracketComponent,
    SportsMatchOverlayBuilderComponent,
    SportsTeamLogoComponent,
    TwemojiComponent,
  ],
  templateUrl: './sports-matches-section.component.html',
})
export class SportsMatchesSectionComponent extends SportsWorkspaceSection {
  private readonly matchFormValue = toSignal(this.workspace.matchForm.valueChanges, {
    initialValue: this.workspace.matchForm.getRawValue(),
  });
  private readonly replaceExistingDraft = toSignal(this.workspace.bracketForm.controls.replaceExistingDraft.valueChanges, {
    initialValue: this.workspace.bracketForm.controls.replaceExistingDraft.value,
  });

  protected readonly selectedCategory = computed<SportsCategorySummary | null>(
    () => this.workspace.tournamentRead()?.categories.find((category) => category.id === this.workspace.selectedCategoryId()) ?? null,
  );
  protected readonly hasGeneratedBracket = computed(() => (this.workspace.categoryRead()?.stages.length ?? 0) > 0);
  protected readonly canGenerateBracket = computed(() => !this.hasGeneratedBracket() || this.replaceExistingDraft());
  protected readonly bracketPreviewActive = computed(() => {
    const review = this.workspace.matchReview();
    const value = this.matchFormValue();
    if (!review) {
      return false;
    }

    return (
      review.match.stageId !== this.stringValue(value.stageId) ||
      (review.match.roundNumber ?? 1) !== this.numberValue(value.roundNumber, 1) ||
      (review.match.bracketPosition ?? 1) !== this.numberValue(value.bracketPosition, 1) ||
      (review.match.groupKey ?? '') !== this.stringValue(value.groupKey) ||
      (review.match.homeRegistrationId ?? '') !== this.stringValue(value.homeRegistrationId) ||
      (review.match.awayRegistrationId ?? '') !== this.stringValue(value.awayRegistrationId) ||
      review.match.state !== this.matchState(value.state, review.match.state)
    );
  });
  protected readonly bracketPreviewSummary = computed(() => {
    const read = this.workspace.categoryRead();
    const value = this.matchFormValue();
    const stage = read?.stages.find((item) => item.id === this.stringValue(value.stageId));
    if (!stage) {
      return 'A partida ficará fora da chave até uma fase ser definida.';
    }

    return `${stage.name} · Rodada ${this.numberValue(value.roundNumber, 1)} · Posição ${this.numberValue(
      value.bracketPosition,
      1,
    )}`;
  });
  protected readonly bracketStagesForDisplay = computed<SportsBracketStageView[]>(() => {
    const stages = this.bracketStages();
    const review = this.workspace.matchReview();
    const read = this.workspace.categoryRead();
    const value = this.matchFormValue();
    if (!review || !read || !this.bracketPreviewActive()) {
      return stages;
    }

    const previewStageId = this.stringValue(value.stageId);
    const currentMatch = stages
      .flatMap((stage) => stage.matches)
      .find((match) => match.id === review.match.id);
    if (!currentMatch) {
      return stages;
    }

    const previewMatch: SportsBracketMatchView = {
      ...currentMatch,
      roundNumber: this.numberValue(value.roundNumber, currentMatch.roundNumber ?? 1),
      bracketPosition: this.numberValue(value.bracketPosition, currentMatch.bracketPosition ?? 1),
      groupKey: this.stringValue(value.groupKey) || null,
      state: this.matchState(value.state, currentMatch.state),
      homeTeam: this.previewBracketTeam(read, this.stringValue(value.homeRegistrationId)),
      awayTeam: this.previewBracketTeam(read, this.stringValue(value.awayRegistrationId)),
    };

    return stages.map((stage) => ({
      ...stage,
      matches: [
        ...stage.matches.filter((match) => match.id !== review.match.id),
        ...(stage.id === previewStageId ? [previewMatch] : []),
      ],
    }));
  });

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private numberValue(value: unknown, fallback: number): number {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  private matchState(value: unknown, fallback: SportsBracketMatchView['state']): SportsBracketMatchView['state'] {
    const states: SportsBracketMatchView['state'][] = [
      'SCHEDULED',
      'CHECK_IN',
      'LIVE',
      'PAUSED',
      'AWAITING_REVIEW',
      'CANCELED',
      'DRAW',
      'FINISHED',
    ];
    return typeof value === 'string' && states.includes(value as SportsBracketMatchView['state'])
      ? (value as SportsBracketMatchView['state'])
      : fallback;
  }

  private previewBracketTeam(read: SportsCategoryRead, registrationId: string): SportsBracketTeamView | null {
    const registration = read.registrations.find((item) => item.id === registrationId);
    const team = this.workspace.tournamentRead()?.teams.find((item) => item.id === registration?.teamId);
    return team ? { id: team.id, name: team.name, logoUrl: team.logoUrl } : null;
  }
}
