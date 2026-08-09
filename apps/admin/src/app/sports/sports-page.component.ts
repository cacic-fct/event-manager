import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute } from '@angular/router';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { SportsApiService } from './sports-api.service';
import { SportsCategoriesSectionComponent } from './sports-categories-section.component';
import { SportsMatchesSectionComponent } from './sports-matches-section.component';
import { SportsOverviewSectionComponent } from './sports-overview-section.component';
import { SportsReviewsSectionComponent } from './sports-reviews-section.component';
import { SportsTeamsSectionComponent } from './sports-teams-section.component';
import { SportsWorkspaceService } from './sports-workspace.service';
import {
  SportsWorkspaceLayoutStylesComponent,
  SportsWorkspaceMatchEditorStylesComponent,
  SportsWorkspaceMatchStylesComponent,
  SportsWorkspaceTeamStylesComponent,
} from './sports-workspace-styles.component';

@Component({
  selector: 'app-workspace-sports-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    TwemojiComponent,
    SportsCategoriesSectionComponent,
    SportsMatchesSectionComponent,
    SportsOverviewSectionComponent,
    SportsReviewsSectionComponent,
    SportsTeamsSectionComponent,
    SportsWorkspaceLayoutStylesComponent,
    SportsWorkspaceMatchEditorStylesComponent,
    SportsWorkspaceMatchStylesComponent,
    SportsWorkspaceTeamStylesComponent,
  ],
  providers: [SportsApiService, SportsWorkspaceService],
  templateUrl: './sports-page.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
  ],
})
export class SportsPageComponent implements OnInit {
  protected readonly workspace = inject(SportsWorkspaceService);
  private readonly route = inject(ActivatedRoute);

  ngOnInit(): void {
    void this.initialize();
  }

  protected setArea(area: 'overview' | 'categories' | 'teams' | 'matches' | 'reviews'): void {
    this.workspace.activeArea.set(area);
  }

  private async initialize(): Promise<void> {
    await this.workspace.initialize();
    const tournamentId = this.route.snapshot.paramMap.get('tournamentId');
    if (tournamentId) {
      await this.workspace.loadTournament(tournamentId);
    }
  }
}
