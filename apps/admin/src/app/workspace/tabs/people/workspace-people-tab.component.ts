import { EventManagerKeycloakRole, Permission } from '@cacic-fct/shared-permissions';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { WorkspaceAuditLogService } from '../../../shared/services/workspace-audit-log.service';
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
    MatTooltipModule,
    TwemojiComponent,
  ],
  templateUrl: './workspace-people-tab.component.html',
  styleUrl: '../workspace-tab.shared.scss',
})
export class WorkspacePeopleTabComponent {
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
