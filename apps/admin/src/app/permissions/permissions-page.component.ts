import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltip } from '@angular/material/tooltip';
import { formatPermissionGroups } from '@cacic-fct/shared-permissions';
import { PermissionsService } from './permissions.service';

@Component({
  selector: 'app-workspace-permissions-tab',
  imports: [MatButtonModule, MatChipsModule, MatIconModule, MatListModule, MatTooltip],
  templateUrl: './permissions-page.component.html',
  styleUrl: './permissions-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PermissionsPageComponent {
  private readonly workspacePermissions = inject(PermissionsService);

  readonly formattedPermissions = computed(() => formatPermissionGroups(this.workspacePermissions.rawPermissions()));

  readonly rawPermissions = this.workspacePermissions.rawPermissions;
}
