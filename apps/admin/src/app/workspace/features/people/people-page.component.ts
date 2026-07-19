import { EventManagerKeycloakRole, Permission } from '@cacic-fct/shared-permissions';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { WorkspaceAuditLogService } from '../../data-access/audit-logs/audit-log.service';
import { WorkspacePeopleService } from '../../data-access/people/people.service';
import { WorkspacePermissionsService } from '../../data-access/permissions/permissions.service';

@Component({
  selector: 'app-workspace-people-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatTooltipModule,
    TwemojiComponent,
  ],
  templateUrl: './people-page.component.html',
  styleUrls: [
    '../../shared/styles/page-layout.shared.scss',
    '../../shared/styles/lists-layout.shared.scss',
    '../../shared/styles/entity-permissions.shared.scss',
    '../../shared/styles/forms-feedback.shared.scss',
  ],
})
export class PeoplePageComponent {
  readonly workspace = inject(WorkspacePeopleService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  protected readonly auditLog = inject(WorkspaceAuditLogService);
  protected readonly permissions = inject(WorkspacePermissionsService);
  protected readonly Permission = Permission;
  protected readonly isSuperAdmin = computed(() => this.auth.roles().includes(EventManagerKeycloakRole.SuperAdmin));

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
