import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
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
import type { SportsCategorySummary } from './sports.models';
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
  protected readonly selectedCategory = computed<SportsCategorySummary | null>(
    () => this.workspace.tournamentRead()?.categories.find((category) => category.id === this.workspace.selectedCategoryId()) ?? null,
  );
}
