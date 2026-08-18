import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { Permission } from '@cacic-fct/shared-permissions';
import { PermissionsService } from './permissions.service';

@Component({
  selector: 'app-workspace-permissions-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, MatIconModule, MatTabsModule],
  templateUrl: './permissions-page.component.html',
  styleUrl: './permissions-page.component.scss',
})
export class PermissionsPageComponent {
  private readonly permissions = inject(PermissionsService);
  protected readonly canManage = () =>
    this.permissions.hasAll([Permission.PermissionGrant.Read, Permission.Person.Read]);
}
