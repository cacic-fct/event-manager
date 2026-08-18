import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltip } from '@angular/material/tooltip';
import { formatPermissionGroups } from '@cacic-fct/shared-permissions';
import { PermissionsService } from '../permissions.service';

@Component({
  selector: 'app-my-permissions',
  imports: [MatChipsModule, MatIconModule, MatListModule, MatTooltip],
  templateUrl: './my-permissions.component.html',
  styleUrl: './my-permissions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyPermissionsComponent {
  private readonly workspacePermissions = inject(PermissionsService);
  readonly formattedPermissions = computed(() => formatPermissionGroups(this.workspacePermissions.rawPermissions()));
  readonly rawPermissions = this.workspacePermissions.rawPermissions;
}
