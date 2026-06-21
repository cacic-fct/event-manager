import { Permission } from '@cacic-fct/shared-permissions';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { WorkspacePeopleService } from '../../../shared/services/workspace-people.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';

@Component({
  selector: 'app-workspace-people-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    MatSlideToggleModule,
    TwemojiComponent,
  ],
  templateUrl: './workspace-people-tab.component.html',
  styleUrl: '../workspace-tab.shared.scss',
})
export class WorkspacePeopleTabComponent {
  readonly workspace = inject(WorkspacePeopleService);
  private readonly route = inject(ActivatedRoute);
  protected readonly permissions = inject(WorkspacePermissionsService);
  protected readonly Permission = Permission;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const personId = params.get('personId');
      if (personId) {
        void this.workspace.selectPersonById(personId);
        return;
      }

      if (this.workspace.selectedPerson()) {
        this.workspace.resetPersonForm();
      }
    });
  }
}
