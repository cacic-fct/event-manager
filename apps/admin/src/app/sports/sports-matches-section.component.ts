import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { SportsMatchBracketListComponent } from './sports-match-bracket-list.component';
import { SportsMatchEditorComponent } from './sports-match-editor.component';
import type { SportsCategorySummary } from './sports.models';
import { SportsWorkspaceSection } from './sports-workspace-section.base';

@Component({
  selector: 'app-sports-matches-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    SportsMatchBracketListComponent,
    SportsMatchEditorComponent,
    TwemojiComponent,
  ],
  templateUrl: './sports-matches-section.component.html',
})
export class SportsMatchesSectionComponent extends SportsWorkspaceSection {
  protected readonly selectedCategory = computed<SportsCategorySummary | null>(
    () =>
      this.workspace
        .tournamentRead()
        ?.categories.find((category) => category.id === this.workspace.selectedCategoryId()) ?? null,
  );
}
