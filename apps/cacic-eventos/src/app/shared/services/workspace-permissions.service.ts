import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '@cacic-eventos/shared-angular';
import { firstValueFrom } from 'rxjs';

export type WorkspacePermissionScope =
  | 'certificate#read'
  | 'certificate#edit'
  | 'event#read'
  | 'event#edit'
  | 'event#delete'
  | 'event-attendance#read'
  | 'event-attendance#edit'
  | 'event-attendance#delete'
  | 'event-lecturer#read'
  | 'event-lecturer#edit'
  | 'event-lecturer#delete'
  | 'major-event#read'
  | 'major-event#edit'
  | 'major-event#delete'
  | 'merge-candidate#read'
  | 'merge-candidate#edit'
  | 'merge-candidate#delete'
  | 'person#read'
  | 'person#edit'
  | 'person#delete';

export type WorkspaceTabPermission = {
  label: string;
  read: readonly WorkspacePermissionScope[];
  edit: readonly WorkspacePermissionScope[];
  delete: readonly WorkspacePermissionScope[];
};

type KeycloakPermissionClaim =
  | string
  | {
      rsname?: unknown;
      resource_name?: unknown;
      scopes?: unknown;
    };

const TAB_PERMISSIONS = [
  {
    label: 'Eventos',
    read: [
      'event#read',
      'major-event#read',
      'event-lecturer#read',
      'person#read',
    ],
    edit: ['event#edit', 'event-lecturer#edit', 'person#edit'],
    delete: ['event#delete', 'event-lecturer#delete'],
  },
  {
    label: 'Grandes eventos',
    read: ['major-event#read', 'event#read'],
    edit: ['major-event#edit', 'event#edit'],
    delete: ['major-event#delete'],
  },
  {
    label: 'Grupos',
    read: ['event#read'],
    edit: ['event#edit'],
    delete: ['event#delete'],
  },
  {
    label: 'Pessoas',
    read: ['person#read'],
    edit: ['person#edit'],
    delete: ['person#delete'],
  },
  {
    label: 'Pessoas duplicadas',
    read: ['merge-candidate#read', 'person#read'],
    edit: ['merge-candidate#edit', 'person#edit'],
    delete: ['merge-candidate#delete'],
  },
  {
    label: 'Certificados',
    read: ['certificate#read', 'event#read', 'major-event#read', 'person#read'],
    edit: ['certificate#edit'],
    delete: [],
  },
  {
    label: 'Presenças',
    read: [
      'event-attendance#read',
      'event#read',
      'major-event#read',
      'person#read',
    ],
    edit: ['event-attendance#edit'],
    delete: ['event-attendance#delete'],
  },
] as const satisfies readonly WorkspaceTabPermission[];

@Injectable({
  providedIn: 'root',
})
export class WorkspacePermissionsService {
  private readonly authService = inject(AuthService);
  private readonly http = inject(HttpClient);

  readonly tabs = TAB_PERMISSIONS;
  private readonly evaluatedPermissions = signal<Set<string>>(new Set());
  readonly granted = computed(() => {
    const permissions = this.extractGrantedPermissions();
    for (const permission of this.evaluatedPermissions()) {
      permissions.add(permission);
    }
    return permissions;
  });

  has(scope: WorkspacePermissionScope): boolean {
    return this.granted().has(scope);
  }

  hasAll(scopes: readonly WorkspacePermissionScope[]): boolean {
    return scopes.every((scope) => this.has(scope));
  }

  missing(
    scopes: readonly WorkspacePermissionScope[],
  ): WorkspacePermissionScope[] {
    return [...new Set(scopes)].filter((scope) => !this.has(scope));
  }

  canReadTab(index: number): boolean {
    return this.hasAll(this.tabs[index]?.read ?? []);
  }

  missingReadForTab(index: number): WorkspacePermissionScope[] {
    return this.missing(this.tabs[index]?.read ?? []);
  }

  canEdit(...scopes: WorkspacePermissionScope[]): boolean {
    return this.hasAll(scopes);
  }

  canDelete(...scopes: WorkspacePermissionScope[]): boolean {
    return this.hasAll(scopes);
  }

  async evaluateWorkspacePermissions(): Promise<void> {
    const permissions = this.tabs.flatMap((tab) => [
      ...tab.read,
      ...tab.edit,
      ...tab.delete,
    ]);
    const uniquePermissions = [...new Set(permissions)];
    const result = await firstValueFrom(
      this.http.post<{ permissions: string[] }>(
        '/api/auth/permissions/evaluate',
        {
          permissions: uniquePermissions,
        },
      ),
    );

    this.evaluatedPermissions.set(new Set(result.permissions));
  }

  private extractGrantedPermissions(): Set<string> {
    const permissions = new Set<string>();
    const user = this.authService.user();

    this.addPermissionClaims(user?.claims?.['permissions'], permissions);

    const authorizationClaim = user?.claims?.['authorization'];
    if (this.isRecord(authorizationClaim)) {
      this.addPermissionClaims(authorizationClaim['permissions'], permissions);
    }

    this.addPermissionClaims(user?.permissions, permissions);

    return permissions;
  }

  private addPermissionClaims(
    rawPermissions: unknown,
    permissions: Set<string>,
  ): void {
    if (!Array.isArray(rawPermissions)) {
      return;
    }

    for (const permission of rawPermissions as KeycloakPermissionClaim[]) {
      if (typeof permission === 'string') {
        this.addNormalizedPermission(permission, permissions);
        continue;
      }

      if (!this.isRecord(permission)) {
        continue;
      }

      const resourceName =
        this.readString(permission['rsname']) ??
        this.readString(permission['resource_name']);

      const rawScopes = permission['scopes'];
      if (!Array.isArray(rawScopes)) {
        continue;
      }

      for (const scope of rawScopes) {
        if (typeof scope !== 'string') {
          continue;
        }

        this.addNormalizedPermission(
          resourceName ? `${resourceName}#${scope}` : scope,
          permissions,
        );
      }
    }
  }

  private addNormalizedPermission(
    permission: string,
    permissions: Set<string>,
  ): void {
    const normalizedPermission = permission.trim();
    if (normalizedPermission) {
      permissions.add(normalizedPermission);
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private readString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed || undefined;
  }
}
