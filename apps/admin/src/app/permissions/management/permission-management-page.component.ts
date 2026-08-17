import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { type Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom } from 'rxjs';
import { PersonSearchComponent } from '../../people/person-search/person-search.component';
import { PermissionManagementStore } from './permission-management.store';
import { RoleTemplateDialogComponent } from './role-template-dialog.component';
import { UnsavedChangesBarComponent } from './unsaved-changes-bar.component';

@Component({
  selector: 'app-permission-management-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule, MatCheckboxModule, MatChipsModule, MatDividerModule, MatFormFieldModule, MatIconModule,
    MatInputModule, MatListModule, MatProgressSpinnerModule, MatSelectModule, MatTabsModule, MatTooltipModule,
    TwemojiComponent, PersonSearchComponent, UnsavedChangesBarComponent,
  ],
  providers: [PermissionManagementStore],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  templateUrl: './permission-management-page.component.html',
  styleUrls: [
    '../../app-shell/layout/page-layout.shared.scss',
    '../../app-shell/layout/workspace-tabs.shared.scss',
    './permission-management-page.component.scss',
  ],
})
export class PermissionManagementPageComponent {
  protected readonly store = inject(PermissionManagementStore);
  private readonly dialog = inject(MatDialog);

  constructor() { void this.store.load(); }

  protected async openNewRoleDialog(): Promise<void> {
    const reference = this.dialog.open(RoleTemplateDialogComponent, { width: 'min(44rem, calc(100vw - 2rem))' });
    const template = await firstValueFrom(reference.afterClosed());
    if (template !== undefined) this.store.startNewRole(template);
  }

  protected permissionValue(resource: string, scope: string): Permission {
    return `${resource}#${scope}` as Permission;
  }

  protected inheritedFrom(permission: Permission): string {
    const draft = this.store.roleDraft();
    if (!draft) return '';
    return this.store.roles()
      .filter((role) => draft.parentRoleIds.includes(role.id) && [...role.permissions, ...role.inheritedPermissions].includes(permission))
      .map((role) => role.name)
      .join(', ');
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.store.pending.dirty()) return;
    event.preventDefault();
    event.returnValue = '';
  }
}
