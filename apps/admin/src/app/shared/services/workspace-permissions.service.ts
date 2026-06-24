import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import {
  EVENT_MANAGER_PERMISSION_SET,
  Permission,
  WORKSPACE_PERMISSION_EVALUATION_SET,
  WORKSPACE_TAB_PERMISSIONS,
} from '@cacic-fct/shared-permissions';
import { firstValueFrom } from 'rxjs';

export type WorkspacePermissionScope = Permission;

export enum WorkspacePermissionTab {
  Events = 0,
  MajorEvents = 1,
  Groups = 2,
  People = 3,
  MergeCandidates = 4,
  Certificates = 5,
  Attendances = 6,
  Subscriptions = 7,
  Places = 8,
  GlobalOperations = 9,
  Permissions = 10,
  Notifications = 11,
  Preferences = 12,
}

const TAB_PERMISSIONS = WORKSPACE_TAB_PERMISSIONS;

@Injectable({
  providedIn: 'root',
})
export class WorkspacePermissionsService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  readonly tabs = TAB_PERMISSIONS;
  private readonly evaluatedPermissions = signal<Set<Permission>>(new Set());
  private workspacePermissionsEvaluated = false;
  private evaluationPromise: Promise<void> | null = null;
  readonly granted = computed(() => this.evaluatedPermissions());

  has(scope: WorkspacePermissionScope): boolean {
    return this.granted().has(scope);
  }

  hasAll(scopes: readonly WorkspacePermissionScope[]): boolean {
    return scopes.every((scope) => this.has(scope));
  }

  hasAny(scopes: readonly WorkspacePermissionScope[]): boolean {
    return scopes.some((scope) => this.has(scope));
  }

  missing(scopes: readonly WorkspacePermissionScope[]): WorkspacePermissionScope[] {
    return [...new Set(scopes)].filter((scope) => !this.has(scope));
  }

  canReadTab(tab: WorkspacePermissionTab): boolean {
    return this.hasAll(this.tabs[tab]?.read ?? []);
  }

  missingReadForTab(tab: WorkspacePermissionTab): WorkspacePermissionScope[] {
    return this.missing(this.tabs[tab]?.read ?? []);
  }

  canEdit(...scopes: WorkspacePermissionScope[]): boolean {
    return this.hasAll(scopes);
  }

  canDelete(...scopes: WorkspacePermissionScope[]): boolean {
    return this.hasAll(scopes);
  }

  async evaluateWorkspacePermissions(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.workspacePermissionsEvaluated) {
      return;
    }

    if (this.evaluationPromise) {
      return this.evaluationPromise;
    }

    this.evaluationPromise = this.fetchWorkspacePermissions();

    try {
      await this.evaluationPromise;
    } finally {
      this.evaluationPromise = null;
    }
  }

  private async fetchWorkspacePermissions(): Promise<void> {
    const uniquePermissions = [...new Set(WORKSPACE_PERMISSION_EVALUATION_SET)];
    const result = await firstValueFrom(
      this.http.post<{ permissions: string[] }>('/api/auth/permissions/evaluate', {
        permissions: uniquePermissions,
      }),
    );

    this.evaluatedPermissions.set(
      new Set(
        result.permissions.filter((permission): permission is Permission =>
          EVENT_MANAGER_PERMISSION_SET.has(permission as Permission),
        ),
      ),
    );
    this.workspacePermissionsEvaluated = true;
  }

  readonly rawPermissions = computed(() => {
    return Array.from(this.granted());
  });
}
