import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  SportsBracketComponent,
  SportsMatchOverlayBuilderComponent,
  SportsTeamLogoComponent,
} from '@cacic-fct/shared-angular';
import { SportsWorkspaceSection } from './sports-workspace-section.base';

@Component({
  selector: 'app-sports-matches-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDividerModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    MatTooltipModule,
    SportsBracketComponent,
    SportsMatchOverlayBuilderComponent,
    SportsTeamLogoComponent,
  ],
  templateUrl: './sports-matches-section.component.html',
})
export class SportsMatchesSectionComponent extends SportsWorkspaceSection {}
