import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { SportsApiService } from './sports-api.service';
import { SportsCategoriesSectionComponent } from './sports-categories-section.component';
import { SportsMatchesSectionComponent } from './sports-matches-section.component';
import { SportsOverviewSectionComponent } from './sports-overview-section.component';
import { SportsReviewsSectionComponent } from './sports-reviews-section.component';
import { SportsTeamsSectionComponent } from './sports-teams-section.component';
import { SportsWorkspaceService } from './sports-workspace.service';
import type { SportsMajorEventWorkspaceItem } from './sports.models';
import {
  isSportsWorkspaceArea,
  parseSportsWorkspaceRoute,
  sportsWorkspaceRoute,
  type SportsWorkspaceArea,
  type SportsWorkspaceRouteState,
} from './sports-workspace-routes';

@Component({
  selector: 'app-workspace-sports-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // These styles intentionally cover the standalone section components rendered by this workspace.
  encapsulation: ViewEncapsulation.None,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    TwemojiComponent,
    SportsCategoriesSectionComponent,
    SportsMatchesSectionComponent,
    SportsOverviewSectionComponent,
    SportsReviewsSectionComponent,
    SportsTeamsSectionComponent,
  ],
  providers: [SportsApiService, SportsWorkspaceService],
  templateUrl: './sports-page.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
    './sports-workspace-layout.scss',
    './sports-workspace-teams.scss',
    './sports-workspace-matches.scss',
    './sports-workspace-match-editor.scss',
  ],
})
export class SportsPageComponent {
  protected readonly workspace = inject(SportsWorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private initialization: Promise<void> | null = null;
  private routeRevision = 0;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.applyRoute(params);
    });
  }

  protected async openTournament(tournamentId: string): Promise<void> {
    try {
      await this.workspace.loadTournament(tournamentId);
    } catch (error) {
      await this.redirectFromMissingTournament(error);
      return;
    }
    await this.router.navigate(['/sports', tournamentId]).catch(() => undefined);
  }

  protected openMajorEvent(item: SportsMajorEventWorkspaceItem): void {
    if (item.tournament) {
      void this.openTournament(item.tournament.tournament.id);
      return;
    }
    void this.workspace.openMajorEvent(item.majorEvent.id);
  }

  protected setArea(area: SportsWorkspaceArea): void {
    const tournamentId = this.workspace.tournamentId();
    if (!tournamentId) {
      return;
    }

    this.workspace.activeArea.set(area);
    void this.router
      .navigate(
        sportsWorkspaceRoute(tournamentId, area, {
          categoryId: this.workspace.selectedCategoryId() || undefined,
          teamId: this.workspace.selectedTeamId() || undefined,
          matchId: this.workspace.selectedMatchId() || undefined,
        }),
      )
      .catch(() => undefined);
  }

  private async applyRoute(params: { get(name: string): string | null }): Promise<void> {
    const revision = ++this.routeRevision;
    const areaParam = params.get('area');
    if (areaParam && !isSportsWorkspaceArea(areaParam)) {
      const tournamentId = params.get('tournamentId');
      void this.router.navigate(tournamentId ? ['/sports', tournamentId] : ['/sports']).catch(() => undefined);
      return;
    }

    const route = parseSportsWorkspaceRoute(params);
    await this.initializeWorkspace();
    if (revision !== this.routeRevision) {
      return;
    }

    if (!route.tournamentId) {
      this.workspace.resetWorkspaceRoute();
      return;
    }

    if (this.workspace.tournamentId() !== route.tournamentId) {
      try {
        await this.workspace.loadTournament(route.tournamentId);
      } catch (error) {
        await this.redirectFromMissingTournament(error, revision);
        return;
      }
      if (revision !== this.routeRevision) {
        return;
      }
    }

    this.workspace.activeArea.set(route.area);
    await this.applyRouteSelection(route, revision);
  }

  private async applyRouteSelection(route: SportsWorkspaceRouteState, revision: number): Promise<void> {
    switch (route.area) {
      case 'overview':
        this.workspace.newCategory(false);
        this.workspace.newTeam(false);
        this.workspace.newMatch(false);
        return;
      case 'categories': {
        if (!route.categoryId) {
          this.workspace.newCategory(false);
          return;
        }
        const category = this.workspace.tournamentRead()?.categories.find((item) => item.id === route.categoryId);
        if (!category) {
          this.workspace.newCategory(false);
          return;
        }
        if (this.workspace.selectedCategoryId() !== category.id || !this.workspace.categoryRead()) {
          await this.workspace.selectCategory(category, { navigate: false });
        }
        if (revision !== this.routeRevision) {
          return;
        }
        return;
      }
      case 'teams': {
        if (!route.teamId) {
          this.workspace.newTeam(false);
          return;
        }
        const team = this.workspace.tournamentRead()?.teams.find((item) => item.id === route.teamId);
        if (!team) {
          this.workspace.newTeam(false);
          return;
        }
        if (this.workspace.selectedTeamId() !== team.id || !this.workspace.teamRead()) {
          await this.workspace.selectTeam(team, { navigate: false });
        }
        if (revision !== this.routeRevision) {
          return;
        }
        return;
      }
      case 'matches': {
        if (!route.categoryId) {
          this.workspace.newCategory(false);
          this.workspace.newMatch(false);
          return;
        }
        const category = this.workspace.tournamentRead()?.categories.find((item) => item.id === route.categoryId);
        if (!category) {
          this.workspace.newCategory(false);
          this.workspace.newMatch(false);
          return;
        }
        if (this.workspace.selectedCategoryId() !== category.id || !this.workspace.categoryRead()) {
          await this.workspace.selectCategory(category, { navigate: false });
        }
        if (revision !== this.routeRevision) {
          return;
        }
        const match = route.matchId
          ? this.workspace.categoryRead()?.matches.find((item) => item.id === route.matchId)
          : undefined;
        if (match) {
          if (this.workspace.selectedMatchId() !== match.id || !this.workspace.matchReview()) {
            await this.workspace.selectMatch(match, { navigate: false });
          }
        } else {
          this.workspace.newMatch(false);
        }
        return;
      }
      case 'reviews': {
        if (!route.teamId) {
          this.workspace.newTeam(false);
          return;
        }
        const team = this.workspace.tournamentRead()?.teams.find((item) => item.id === route.teamId);
        if (!team) {
          this.workspace.newTeam(false);
          return;
        }
        if (this.workspace.selectedTeamId() !== team.id || !this.workspace.teamRead()) {
          await this.workspace.selectTeam(team, { navigate: false });
        }
        if (revision !== this.routeRevision) {
          return;
        }
        return;
      }
    }
  }

  private initializeWorkspace(): Promise<void> {
    this.initialization ??= this.workspace.initialize();
    return this.initialization;
  }

  private async redirectFromMissingTournament(error: unknown, revision = this.routeRevision): Promise<void> {
    if (revision !== this.routeRevision || !this.isMissingTournamentError(error)) {
      return;
    }
    this.workspace.resetWorkspaceRoute();
    await this.router.navigate(['/sports'], { replaceUrl: true }).catch(() => undefined);
  }

  private isMissingTournamentError(error: unknown): boolean {
    return error instanceof Error && /Sports tournament .* was not found\./i.test(error.message);
  }
}
