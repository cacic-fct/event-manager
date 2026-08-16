import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EventFormRendererComponent, SportsTeamLogoComponent, TwemojiComponent } from '@cacic-fct/shared-angular';
import { SportsWorkspaceSection } from './sports-workspace-section.base';
import { PersonSearchComponent } from '../people/person-search/person-search.component';

@Component({
  selector: 'app-sports-teams-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    MatTooltipModule,
    SportsTeamLogoComponent,
    EventFormRendererComponent,
    TwemojiComponent,
    PersonSearchComponent,
  ],
  templateUrl: './sports-teams-section.component.html',
})
export class SportsTeamsSectionComponent extends SportsWorkspaceSection {}
