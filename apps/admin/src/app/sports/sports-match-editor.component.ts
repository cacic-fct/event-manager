import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SportsMatchOverlayBuilderComponent, SportsTeamLogoComponent } from '@cacic-fct/shared-angular';
import { SPORTS_ROSTER_ROLE_LABELS, type SportsRosterRole } from '@cacic-fct/shared-data-types/sports-metadata';
import type { SportsCategoryRead } from './sports.models';
import { SportsWorkspaceSection } from './sports-workspace-section.base';
import { PersonSearchComponent } from '../people/person-search/person-search.component';

@Component({
  selector: 'app-sports-match-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'match-editor-panel',
    role: 'complementary',
    'aria-labelledby': 'match-editor-title',
  },
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
    SportsMatchOverlayBuilderComponent,
    SportsTeamLogoComponent,
    PersonSearchComponent,
  ],
  templateUrl: './sports-match-editor.component.html',
})
export class SportsMatchEditorComponent extends SportsWorkspaceSection {
  readonly categoryRead = input.required<SportsCategoryRead>();
  protected readonly lineupRoles = Object.entries(SPORTS_ROSTER_ROLE_LABELS).map(([value, label]) => ({
    value: value as SportsRosterRole,
    label,
  }));
}
