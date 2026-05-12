import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltip } from '@angular/material/tooltip';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';

type PermissionGroup = {
  type: string;
  label: string;
  resourceIcon: string;
  actions: {
    scope: string;
    label: string;
    icon: string;
  }[];
};

@Component({
  selector: 'app-workspace-permissions-tab',
  imports: [MatChipsModule, MatIconModule, MatListModule, MatTooltip],
  templateUrl: './workspace-permissions-tab.component.html',
  styleUrl: './workspace-permissions-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspacePermissionsTabComponent {
  private readonly workspacePermissions = inject(WorkspacePermissionsService);

  readonly formattedPermissions = computed(() => this.formatPermissions(this.workspacePermissions.rawPermissions()));

  readonly rawPermissions = this.workspacePermissions.rawPermissions;

  private formatPermissions(permissions: string[]): PermissionGroup[] {
    const groupedPermissions = new Map<string, PermissionGroup>();

    for (const permission of permissions) {
      const [resource, action = 'unknown'] = permission.split('#');
      if (!groupedPermissions.has(resource)) {
        groupedPermissions.set(resource, {
          type: resource,
          label: this.getFormattedResource(resource),
          resourceIcon: this.getResourceIcon(resource),
          actions: [],
        });
      }

      const group = groupedPermissions.get(resource)!;
      if (!group.actions.some((entry) => entry.scope === action)) {
        group.actions.push({
          scope: action,
          label: this.getFormattedAction(action),
          icon: this.getActionIcon(action),
        });
      }
    }

    return [...groupedPermissions.values()].sort((left, right) => left.label.localeCompare(right.label));
  }

  private getFormattedAction(action: string): string {
    switch (action) {
      case 'read':
        return 'Visualizar';
      case 'create':
        return 'Criar';
      case 'edit':
      case 'update':
        return 'Editar';
      case 'delete':
        return 'Excluir';
      case 'manage':
        return 'Gerenciar';
      default:
        return action;
    }
  }

  private getFormattedResource(resource: string): string {
    switch (resource) {
      case 'event':
        return 'Evento';
      case 'major-event':
        return 'Grande evento';
      case 'event-group':
        return 'Grupo de eventos';
      case 'certificate':
        return 'Certificado';
      case 'event-attendance':
        return 'Presenças';
      case 'event-lecturer':
        return 'Palestrante';
      case 'person':
        return 'Pessoas';
      case 'merge-candidate':
        return 'Pessoa duplicada';
      default:
        return resource;
    }
  }

  private getResourceIcon(type: string): string {
    switch (type) {
      case 'event':
        return 'event';
      case 'major-event':
        return 'festival';
      case 'event-group':
        return 'groups';
      case 'certificate':
        return 'workspace_premium';
      case 'event-lecturer':
        return 'record_voice_over';
      case 'event-attendance':
        return 'fact_check';
      case 'person':
        return 'person';
      case 'merge-candidate':
        return 'merge_type';
      default:
        return 'shield';
    }
  }

  private getActionIcon(action: string): string {
    switch (action) {
      case 'read':
        return 'visibility';
      case 'create':
        return 'add';
      case 'edit':
      case 'update':
        return 'edit';
      case 'delete':
        return 'delete';
      case 'manage':
        return 'admin_panel_settings';
      default:
        return 'help';
    }
  }
}
