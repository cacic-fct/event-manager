import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  SportsLiveDotComponent,
  SportsMatchOverlayBuilderComponent,
  SportsTeamLogoComponent,
} from '@cacic-fct/shared-angular';
import { OfficialMatchPageOperations } from './official-match-page-operations.base';
import { resolveInternalReturnUrl } from '../../shared/internal-return-url';

@Component({
  selector: 'app-official-sports-match-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDialogModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    MatSnackBarModule,
    MatStepperModule,
    MatToolbarModule,
    ReactiveFormsModule,
    RouterLink,
    SportsLiveDotComponent,
    SportsMatchOverlayBuilderComponent,
    SportsTeamLogoComponent,
  ],
  templateUrl: './official-match-page.html',
  styleUrls: ['./official-match-scoreboard.css', './official-match-workflows.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfficialSportsMatchPage extends OfficialMatchPageOperations {
  private readonly operationRoute = inject(ActivatedRoute);
  protected readonly backUrl = resolveInternalReturnUrl(
    this.operationRoute.snapshot.queryParamMap.get('returnUrl'),
    '/calendar',
  );
}
