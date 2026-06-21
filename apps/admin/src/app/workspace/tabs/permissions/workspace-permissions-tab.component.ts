import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltip } from '@angular/material/tooltip';
import { formatPermissionGroups } from '@cacic-fct/shared-permissions';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';

@Component({
  selector: 'app-workspace-permissions-tab',
  imports: [MatChipsModule, MatIconModule, MatListModule, MatTooltip],
  templateUrl: './workspace-permissions-tab.component.html',
  styleUrl: './workspace-permissions-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspacePermissionsTabComponent {
  private readonly workspacePermissions = inject(WorkspacePermissionsService);

  readonly formattedPermissions = computed(() => formatPermissionGroups(this.workspacePermissions.rawPermissions()));

  readonly rawPermissions = this.workspacePermissions.rawPermissions;
}
