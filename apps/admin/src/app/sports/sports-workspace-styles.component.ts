import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-sports-workspace-layout-styles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: '',
  styleUrl: './sports-workspace-layout.scss',
})
export class SportsWorkspaceLayoutStylesComponent {}

@Component({
  selector: 'app-sports-workspace-team-styles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: '',
  styleUrl: './sports-workspace-teams.scss',
})
export class SportsWorkspaceTeamStylesComponent {}

@Component({
  selector: 'app-sports-workspace-match-styles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: '',
  styleUrl: './sports-workspace-matches.scss',
})
export class SportsWorkspaceMatchStylesComponent {}
