import { Service, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import type {
  PermissionGroup,
  PermissionGroupSaveInput,
  PermissionRole,
  PermissionRoleAssignment,
  PermissionRoleSaveInput,
  PermissionScope,
  PermissionScopeTarget,
  Person,
} from '@cacic-fct/event-manager-admin-contracts';
import {
  EVENT_MANAGER_PERMISSION_CATALOG,
  expandHardPermissionDependencies,
  formatPermissionGroups,
  getMissingContextPermissionDependencies,
  isPermissionGrantScopeCompatible,
  removePermissionAndDependents,
  Permission,
  type EventManagerRoleTemplate,
} from '@cacic-fct/shared-permissions';
import { firstValueFrom, forkJoin, of } from 'rxjs';
import { AdminFeedbackService } from '../../feedback/admin-feedback.service';
import { PermissionsService } from '../permissions.service';
import { ConfirmationDialogComponent } from '@cacic-fct/shared-angular';
import { PermissionManagementApiService } from '../permission-management-api.service';
import { PendingPermissionChangesService } from './pending-permission-changes.service';
import { PermissionDependencyDialogComponent } from './permission-dependency-dialog.component';
import { isDateAfter } from '../../shared/date-range-validator';

export type RoleDraft = {
  id: string | null;
  expectedVersion: number | null;
  name: string;
  description: string;
  emoji: string;
  isSystem: boolean;
  isExternal: boolean;
  archivedAt: string | null;
  permissions: Permission[];
  inheritedPermissions: Permission[];
  parentRoleIds: string[];
  assignments: PermissionRoleSaveInput['assignments'];
};

export type GroupDraft = {
  id: string | null;
  expectedVersion: number | null;
  name: string;
  description: string;
  emoji: string;
  archivedAt: string | null;
  members: PermissionGroupSaveInput['members'];
};

@Service({ autoProvided: false })
export class PermissionManagementStore {
  private readonly api = inject(PermissionManagementApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly feedback = inject(AdminFeedbackService);
  private readonly permissions = inject(PermissionsService);
  readonly pending = inject(PendingPermissionChangesService);

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly showArchived = signal(false);
  readonly searchingPeople = signal(false);
  readonly groupAssignmentSearchQuery = signal('');
  readonly saving = signal(false);
  readonly roles = signal<PermissionRole[]>([]);
  readonly groups = signal<PermissionGroup[]>([]);
  readonly peopleResults = signal<Person[]>([]);
  readonly selectedPerson = signal<Person | null>(null);
  readonly roleDraft = signal<RoleDraft | null>(null);
  readonly groupDraft = signal<GroupDraft | null>(null);
  readonly selectedRoleId = signal<string | null>(null);
  readonly selectedGroupId = signal<string | null>(null);
  readonly selectedTab = signal(0);
  readonly targets = signal<Record<PermissionScope, PermissionScopeTarget[]>>({
    GLOBAL: [],
    EVENT: [],
    MAJOR_EVENT: [],
    EVENT_GROUP: [],
  });
  readonly permissionGroups = formatPermissionGroups(EVENT_MANAGER_PERMISSION_CATALOG);
  readonly canCreate = computed(() => this.permissions.has(Permission.PermissionGrant.Create));
  readonly canUpdate = computed(() => this.permissions.has(Permission.PermissionGrant.Update));
  readonly canDelete = computed(() => this.permissions.has(Permission.PermissionGrant.Delete));
  readonly canEditRole = computed(() => {
    const draft = this.roleDraft();
    return Boolean(draft && !draft.archivedAt && (draft.id ? this.canUpdate() : this.canCreate()));
  });
  readonly canEditGroup = computed(() => {
    const draft = this.groupDraft();
    return Boolean(draft && !draft.archivedAt && (draft.id ? this.canUpdate() : this.canCreate()));
  });
  readonly predefinedRoles = computed(() => this.roles().filter((role) => role.isSystem));
  readonly customRoles = computed(() => this.roles().filter((role) => !role.isSystem));
  readonly personDirectRoles = computed(() => {
    const personId = this.selectedPerson()?.id;
    return personId
      ? this.roles().filter((role) => role.assignments.some((assignment) => assignment.personId === personId))
      : [];
  });
  readonly personGroups = computed(() => {
    const personId = this.selectedPerson()?.id;
    return personId
      ? this.groups().filter((group) => group.members.some((member) => member.person.id === personId))
      : [];
  });
  readonly selectedGroupRoles = computed(() => {
    const groupId = this.groupDraft()?.id;
    return groupId
      ? this.roles().filter((role) => role.assignments.some((assignment) => assignment.groupId === groupId))
      : [];
  });
  readonly groupAssignmentSearchActive = computed(() => this.groupAssignmentSearchQuery().trim().length >= 2);
  readonly groupAssignmentResults = computed(() => {
    const query = this.groupAssignmentSearchQuery().trim().toLocaleLowerCase('pt-BR');
    if (query.length < 2) return [];
    const assignedGroupIds = new Set(
      (this.roleDraft()?.assignments ?? [])
        .map((assignment) => assignment.groupId)
        .filter((groupId): groupId is string => Boolean(groupId)),
    );
    return this.groups().filter(
      (group) =>
        !assignedGroupIds.has(group.id) &&
        `${group.name} ${group.description}`.toLocaleLowerCase('pt-BR').includes(query),
    );
  });

  constructor() {
    this.pending.register({ reset: () => this.resetCurrentDraft(), save: () => this.saveCurrentDraft() });
  }

  async load(personId?: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [roles, groups, events, majorEvents, eventGroups, linkedPerson] = await firstValueFrom(
        forkJoin([
          this.api.listRoles(this.showArchived()),
          this.api.listGroups(this.showArchived()),
          this.loadAllTargets('EVENT'),
          this.loadAllTargets('MAJOR_EVENT'),
          this.loadAllTargets('EVENT_GROUP'),
          personId ? this.api.getPerson(personId) : of(null),
        ]),
      );
      this.roles.set(roles);
      this.groups.set(groups);
      this.targets.set({ GLOBAL: [], EVENT: events, MAJOR_EVENT: majorEvents, EVENT_GROUP: eventGroups });
      const firstRole = roles[0];
      if (firstRole) this.selectRole(firstRole, true);
      const firstGroup = groups[0];
      if (firstGroup) this.selectGroup(firstGroup, true);
      if (linkedPerson) {
        this.peopleResults.set([linkedPerson]);
        this.selectedPerson.set(linkedPerson);
        this.selectedTab.set(1);
      }
    } catch (error) {
      this.loadError.set(true);
      this.feedback.error(error, 'Não foi possível carregar o gerenciamento de permissões.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadAllTargets(scope: Exclude<PermissionScope, 'GLOBAL'>): Promise<PermissionScopeTarget[]> {
    const pageSize = 100;
    const targets: PermissionScopeTarget[] = [];
    for (let skip = 0; ; skip += pageSize) {
      const page = await firstValueFrom(this.api.listTargets(scope, skip, pageSize));
      targets.push(...page);
      if (page.length < pageSize) return targets;
    }
  }

  async toggleArchived(checked: boolean): Promise<void> {
    if (this.pending.blockNavigation()) return;
    this.showArchived.set(checked);
    await this.load();
  }

  selectTab(index: number): void {
    if (index === this.selectedTab()) return;
    if (this.pending.blockNavigation()) return;
    this.selectedTab.set(index);
    this.pending.clear();
  }

  selectRole(role: PermissionRole, force = false): void {
    if (!force && role.id === this.selectedRoleId()) return;
    if (!force && role.id !== this.selectedRoleId() && this.pending.blockNavigation()) return;
    this.selectedRoleId.set(role.id);
    this.groupAssignmentSearchQuery.set('');
    this.roleDraft.set(this.toRoleDraft(role));
    this.pending.clear();
  }

  selectGroup(group: PermissionGroup, force = false): void {
    if (!force && group.id === this.selectedGroupId()) return;
    if (!force && group.id !== this.selectedGroupId() && this.pending.blockNavigation()) return;
    this.selectedGroupId.set(group.id);
    this.groupDraft.set(this.toGroupDraft(group));
    this.pending.clear();
  }

  startNewRole(template: EventManagerRoleTemplate | null): void {
    if (!this.canCreate()) return;
    if (this.pending.blockNavigation()) return;
    this.selectedRoleId.set(null);
    this.groupAssignmentSearchQuery.set('');
    this.roleDraft.set({
      id: null,
      expectedVersion: null,
      name: template?.name ?? 'Novo cargo',
      description: template?.description ?? '',
      emoji: template?.emoji ?? '🔐',
      isSystem: false,
      isExternal: false,
      archivedAt: null,
      permissions: [...expandHardPermissionDependencies((template?.permissions ?? []) as readonly Permission[])],
      inheritedPermissions: [],
      parentRoleIds: [],
      assignments: [],
    });
    this.pending.markDirty();
  }

  duplicateRole(): void {
    const draft = this.roleDraft();
    if (!draft || draft.isExternal || !this.canCreate()) return;
    if (this.pending.blockNavigation()) return;
    this.roleDraft.set({
      ...draft,
      id: null,
      expectedVersion: null,
      isSystem: false,
      archivedAt: null,
      name: `Cópia de ${draft.name}`,
      assignments: [],
    });
    this.selectedRoleId.set(null);
    this.groupAssignmentSearchQuery.set('');
    this.pending.markDirty();
  }

  startNewGroup(): void {
    if (!this.canCreate()) return;
    if (this.pending.blockNavigation()) return;
    this.selectedGroupId.set(null);
    this.groupDraft.set({
      id: null,
      expectedVersion: null,
      name: 'Novo grupo',
      description: '',
      emoji: '👥',
      archivedAt: null,
      members: [],
    });
    this.pending.markDirty();
  }

  patchRole(patch: Partial<RoleDraft>): void {
    const draft = this.roleDraft();
    if (!draft || draft.archivedAt || (draft.id ? !this.canUpdate() : !this.canCreate())) return;
    if (draft.isSystem && Object.keys(patch).some((key) => key !== 'assignments')) return;
    this.roleDraft.set({ ...draft, ...patch });
    this.pending.markDirty();
  }

  patchGroup(patch: Partial<GroupDraft>): void {
    const draft = this.groupDraft();
    if (!draft || draft.archivedAt || (draft.id ? !this.canUpdate() : !this.canCreate())) return;
    this.groupDraft.set({ ...draft, ...patch });
    this.pending.markDirty();
  }

  async togglePermission(permission: Permission, checked: boolean): Promise<void> {
    const draft = this.roleDraft();
    if (!draft || draft.isSystem || draft.inheritedPermissions.includes(permission)) return;
    let next = checked
      ? expandHardPermissionDependencies([...draft.permissions, permission])
      : removePermissionAndDependents(draft.permissions, permission);
    if (checked) {
      const missing = getMissingContextPermissionDependencies(next);
      if (missing.length) {
        const accepted = await firstValueFrom(
          this.dialog
            .open(PermissionDependencyDialogComponent, {
              width: 'min(42rem, calc(100vw - 2rem))',
              data: missing,
            })
            .afterClosed(),
        );
        if (!accepted) return;
        next = expandHardPermissionDependencies([...next, ...missing.flatMap((item) => item.requires)]);
      }
    }
    this.patchRole({ permissions: [...next] });
  }

  compatibleScopes(assignmentIndex?: number, scopeIndex?: number): PermissionScope[] {
    const draft = this.roleDraft();
    const permissions = draft ? [...draft.permissions, ...draft.inheritedPermissions] : [];
    const currentScope =
      assignmentIndex === undefined || scopeIndex === undefined
        ? null
        : draft?.assignments[assignmentIndex]?.scopes[scopeIndex]?.scope;
    return (['GLOBAL', 'MAJOR_EVENT', 'EVENT_GROUP', 'EVENT'] as PermissionScope[]).filter(
      (scope) =>
        scope === currentScope ||
        permissions.every((permission) => isPermissionGrantScopeCompatible(permission, scope)),
    );
  }

  scopeIssue(assignmentIndex: number): string | null {
    const scopes = this.roleDraft()?.assignments[assignmentIndex]?.scopes ?? [];
    if (scopes.length > 1 && scopes.some((scope) => scope.scope === 'GLOBAL')) {
      return 'O escopo global já cobre todos os demais. Remova os escopos redundantes.';
    }
    const keys = scopes.map((scope) => `${scope.scope}:${this.targetId(scope) ?? 'global'}`);
    if (new Set(keys).size !== keys.length) return 'O mesmo escopo foi adicionado mais de uma vez.';
    for (let leftIndex = 0; leftIndex < scopes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < scopes.length; rightIndex += 1) {
        const left = scopes[leftIndex];
        const right = scopes[rightIndex];
        const leftId = this.targetId(left);
        const rightId = this.targetId(right);
        if (
          leftId &&
          rightId &&
          (this.targetAncestors(right.scope, rightId).has(leftId) ||
            this.targetAncestors(left.scope, leftId).has(rightId))
        ) {
          return 'Um escopo pai já cobre este grupo ou evento filho.';
        }
      }
    }
    return null;
  }

  assignmentValidityIssue(assignmentIndex: number): string | null {
    const assignment = this.roleDraft()?.assignments[assignmentIndex];
    if (!assignment || assignment.unlimited || !isDateAfter(assignment.validFrom, assignment.validUntil)) {
      return null;
    }

    return 'A expiração da atribuição deve ser igual ou posterior ao início.';
  }

  toggleParentRole(parentRoleId: string, checked: boolean): void {
    const draft = this.roleDraft();
    if (!draft || draft.isSystem) return;
    const parentRoleIds = checked
      ? [...new Set([...draft.parentRoleIds, parentRoleId])]
      : draft.parentRoleIds.filter((id) => id !== parentRoleId);
    const inheritedPermissions = this.roles()
      .filter((role) => parentRoleIds.includes(role.id))
      .flatMap((role) => [...role.permissions, ...role.inheritedPermissions]) as Permission[];
    this.patchRole({ parentRoleIds, inheritedPermissions: [...new Set(inheritedPermissions)] });
  }

  addPersonAssignment(person: Person): void {
    const draft = this.roleDraft();
    if (!draft || draft.assignments.some((assignment) => assignment.personId === person.id)) return;
    this.patchRole({ assignments: [...draft.assignments, this.newAssignment({ personId: person.id })] });
  }

  addGroupAssignment(groupId: string): void {
    const draft = this.roleDraft();
    if (!draft || !groupId || draft.assignments.some((assignment) => assignment.groupId === groupId)) return;
    this.patchRole({ assignments: [...draft.assignments, this.newAssignment({ groupId })] });
    this.groupAssignmentSearchQuery.set('');
  }

  removeAssignment(index: number): void {
    const draft = this.roleDraft();
    if (!draft) return;
    this.patchRole({ assignments: draft.assignments.filter((_, itemIndex) => itemIndex !== index) });
  }

  patchAssignment(index: number, patch: Partial<PermissionRoleSaveInput['assignments'][number]>): void {
    const draft = this.roleDraft();
    if (!draft) return;
    this.patchRole({
      assignments: draft.assignments.map((assignment, itemIndex) =>
        itemIndex === index ? { ...assignment, ...patch } : assignment,
      ),
    });
  }

  addScope(assignmentIndex: number): void {
    const draft = this.roleDraft();
    const assignment = draft?.assignments[assignmentIndex];
    if (!draft || !assignment) return;
    this.patchAssignment(assignmentIndex, { scopes: [...assignment.scopes, this.newScope('EVENT')] });
  }

  patchScope(
    assignmentIndex: number,
    scopeIndex: number,
    patch: Partial<PermissionRoleSaveInput['assignments'][number]['scopes'][number]>,
  ): void {
    const draft = this.roleDraft();
    const assignment = draft?.assignments[assignmentIndex];
    if (!draft || !assignment) return;
    const scopes = assignment.scopes.map((scope, itemIndex) => {
      if (itemIndex !== scopeIndex) return scope;
      if (patch.scope && patch.scope !== scope.scope) return { ...this.newScope(patch.scope), ...patch };
      return { ...scope, ...patch };
    });
    this.patchAssignment(assignmentIndex, { scopes });
  }

  removeScope(assignmentIndex: number, scopeIndex: number): void {
    const assignment = this.roleDraft()?.assignments[assignmentIndex];
    if (!assignment || assignment.scopes.length === 1) return;
    this.patchAssignment(assignmentIndex, { scopes: assignment.scopes.filter((_, index) => index !== scopeIndex) });
  }

  assignmentName(assignment: PermissionRoleSaveInput['assignments'][number]): string {
    if (assignment.personId)
      return (
        this.peopleResults().find((person) => person.id === assignment.personId)?.name ??
        this.roles()
          .flatMap((role) => role.assignments)
          .find((item) => item.personId === assignment.personId)?.subjectName ??
        'Pessoa'
      );
    return this.groups().find((group) => group.id === assignment.groupId)?.name ?? 'Grupo';
  }

  assignmentHasLinkedUser(assignment: PermissionRoleSaveInput['assignments'][number]): boolean {
    if (!assignment.personId) return true;
    const result = this.peopleResults().find((person) => person.id === assignment.personId);
    if (result) return Boolean(result.userId);
    return Boolean(
      this.roles()
        .flatMap((role) => role.assignments)
        .find((item) => item.personId === assignment.personId)?.subjectHasLinkedUser,
    );
  }

  async searchPeople(query: string): Promise<void> {
    const normalized = query.trim();
    if (normalized.length < 2) {
      this.peopleResults.set([]);
      return;
    }
    this.searchingPeople.set(true);
    try {
      this.peopleResults.set(await firstValueFrom(this.api.searchPeople(normalized)));
    } catch (error) {
      this.feedback.error(error, 'Não foi possível buscar pessoas.');
    } finally {
      this.searchingPeople.set(false);
    }
  }

  searchGroups(query: string): void {
    this.groupAssignmentSearchQuery.set(query);
  }

  selectPerson(person: Person): void {
    if (this.pending.blockNavigation()) return;
    this.selectedPerson.set(person);
    this.pending.clear();
  }

  editRoleFromPeople(role: PermissionRole): void {
    this.selectedPerson.set(null);
    this.selectRole(role, true);
    this.selectedTab.set(0);
  }

  editGroupFromPeople(group: PermissionGroup): void {
    this.selectedPerson.set(null);
    this.selectGroup(group, true);
    this.selectedTab.set(2);
  }

  addGroupMember(person: Person): void {
    const draft = this.groupDraft();
    if (!draft || draft.members.some((member) => member.personId === person.id)) return;
    this.patchGroup({
      members: [...draft.members, { personId: person.id, validFrom: null, validUntil: null, unlimited: true }],
    });
  }

  removeGroupMember(index: number): void {
    const draft = this.groupDraft();
    if (draft) this.patchGroup({ members: draft.members.filter((_, itemIndex) => itemIndex !== index) });
  }

  patchGroupMember(index: number, patch: Partial<PermissionGroupSaveInput['members'][number]>): void {
    const draft = this.groupDraft();
    if (draft)
      this.patchGroup({
        members: draft.members.map((member, itemIndex) => (itemIndex === index ? { ...member, ...patch } : member)),
      });
  }

  groupMemberName(personId: string): string {
    return (
      this.peopleResults().find((person) => person.id === personId)?.name ??
      this.groups()
        .flatMap((group) => group.members)
        .find((member) => member.person.id === personId)?.person.name ??
      'Pessoa'
    );
  }

  targetId(scope: PermissionRoleSaveInput['assignments'][number]['scopes'][number]): string | null {
    return scope.eventId ?? scope.majorEventId ?? scope.eventGroupId ?? null;
  }

  setScopeTarget(assignmentIndex: number, scopeIndex: number, scope: PermissionScope, targetId: string): void {
    this.patchScope(assignmentIndex, scopeIndex, {
      eventId: scope === 'EVENT' ? targetId : null,
      majorEventId: scope === 'MAJOR_EVENT' ? targetId : null,
      eventGroupId: scope === 'EVENT_GROUP' ? targetId : null,
    });
  }

  dateTimeForInput(value: string | Date | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  dateTimeFromInput(value: string): string | null {
    return value ? new Date(value).toISOString() : null;
  }

  private async saveCurrentDraft(): Promise<void> {
    if (this.selectedTab() === 0) await this.saveRole();
    if (this.selectedTab() === 2) await this.saveGroup();
  }

  async archiveCurrentRole(): Promise<void> {
    const draft = this.roleDraft();
    if (!draft?.id || draft.isSystem || !this.canDelete()) return;
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmationDialogComponent, {
          data: {
            title: 'Arquivar cargo?',
            message: 'As atribuições deixam de conceder acesso, mas o histórico permanece disponível para auditoria.',
            confirmLabel: 'Arquivar cargo',
            tone: 'danger',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) return;
    try {
      await firstValueFrom(this.api.archiveRole(draft.id));
      this.roles.update((roles) => roles.filter((role) => role.id !== draft.id));
      const next = this.roles()[0];
      this.roleDraft.set(null);
      this.selectedRoleId.set(null);
      if (next) this.selectRole(next, true);
      else this.pending.clear();
      this.snackbar.open('Cargo arquivado.', 'Fechar', { duration: 2500 });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível arquivar o cargo.');
    }
  }

  async archiveCurrentGroup(): Promise<void> {
    const draft = this.groupDraft();
    if (!draft?.id || !this.canDelete()) return;
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmationDialogComponent, {
          data: {
            title: 'Arquivar grupo?',
            message: 'As participações deixam de conceder acesso, mas o histórico permanece disponível para auditoria.',
            confirmLabel: 'Arquivar grupo',
            tone: 'danger',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) return;
    try {
      await firstValueFrom(this.api.archiveGroup(draft.id));
      this.groups.update((groups) => groups.filter((group) => group.id !== draft.id));
      const next = this.groups()[0];
      this.groupDraft.set(null);
      this.selectedGroupId.set(null);
      if (next) this.selectGroup(next, true);
      else this.pending.clear();
      this.snackbar.open('Grupo arquivado.', 'Fechar', { duration: 2500 });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível arquivar o grupo.');
    }
  }

  private async saveRole(): Promise<void> {
    const draft = this.roleDraft();
    if (!draft || draft.isExternal || this.saving()) return;
    if (!draft.name.trim()) {
      this.snackbar.open('Informe o nome do cargo.', 'Fechar', { duration: 3000 });
      return;
    }
    const scopeProblem = draft.assignments.map((_, index) => this.scopeIssue(index)).find(Boolean);
    if (scopeProblem) {
      this.snackbar.open(scopeProblem, 'Fechar', { duration: 4000 });
      return;
    }
    const validityProblem = draft.assignments.map((_, index) => this.assignmentValidityIssue(index)).find(Boolean);
    if (validityProblem) {
      this.snackbar.open(validityProblem, 'Fechar', { duration: 4000 });
      return;
    }
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.saveRole({
          id: draft.id,
          expectedVersion: draft.expectedVersion,
          name: draft.name,
          description: draft.description,
          emoji: draft.emoji,
          permissions: draft.permissions,
          parentRoleIds: draft.parentRoleIds,
          assignments: draft.assignments,
        }),
      );
      this.roles.update((roles) =>
        [...roles.filter((role) => role.id !== saved.id), saved].sort(
          (left, right) => Number(right.isSystem) - Number(left.isSystem) || left.name.localeCompare(right.name),
        ),
      );
      this.selectRole(saved, true);
      this.snackbar.open('Cargo salvo.', 'Fechar', { duration: 2500 });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível salvar o cargo.');
    } finally {
      this.saving.set(false);
    }
  }

  private async saveGroup(): Promise<void> {
    const draft = this.groupDraft();
    if (!draft || this.saving()) return;
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.saveGroup({
          id: draft.id,
          expectedVersion: draft.expectedVersion,
          name: draft.name,
          description: draft.description,
          emoji: draft.emoji,
          members: draft.members,
        }),
      );
      this.groups.update((groups) =>
        [...groups.filter((group) => group.id !== saved.id), saved].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      this.selectGroup(saved, true);
      this.snackbar.open('Grupo salvo.', 'Fechar', { duration: 2500 });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível salvar o grupo.');
    } finally {
      this.saving.set(false);
    }
  }

  private resetCurrentDraft(): void {
    if (this.selectedTab() === 0) {
      const role = this.roles().find((item) => item.id === this.selectedRoleId());
      if (role) this.selectRole(role, true);
      else this.roleDraft.set(null);
    } else if (this.selectedTab() === 2) {
      const group = this.groups().find((item) => item.id === this.selectedGroupId());
      if (group) this.selectGroup(group, true);
      else this.groupDraft.set(null);
    }
    this.pending.clear();
  }

  private toRoleDraft(role: PermissionRole): RoleDraft {
    return {
      id: role.id,
      expectedVersion: role.version,
      name: role.name,
      description: role.description,
      emoji: role.emoji,
      isSystem: role.isSystem,
      isExternal: role.isExternal,
      archivedAt: role.archivedAt ?? null,
      permissions: role.permissions as Permission[],
      inheritedPermissions: role.inheritedPermissions as Permission[],
      parentRoleIds: role.parentRoleIds,
      assignments: role.assignments
        .filter((assignment) => (role.archivedAt ? true : !assignment.archivedAt))
        .map((assignment) => this.assignmentFromRecord(assignment)),
    };
  }

  private assignmentFromRecord(assignment: PermissionRoleAssignment): PermissionRoleSaveInput['assignments'][number] {
    return {
      personId: assignment.personId,
      groupId: assignment.groupId,
      validFrom: assignment.validFrom,
      validUntil: assignment.validUntil,
      unlimited: assignment.unlimited,
      scopes: assignment.scopes
        .filter((scope) => !scope.archivedAt)
        .map((scope) => ({
          scope: scope.scope,
          eventId: scope.eventId,
          majorEventId: scope.majorEventId,
          eventGroupId: scope.eventGroupId,
          validFrom: scope.validFrom,
          validUntil: scope.validUntil,
          unlimited: scope.unlimited,
        })),
    };
  }

  private toGroupDraft(group: PermissionGroup): GroupDraft {
    return {
      id: group.id,
      expectedVersion: group.version,
      name: group.name,
      description: group.description,
      emoji: group.emoji,
      archivedAt: group.archivedAt ?? null,
      members: group.members
        .filter((member) => (group.archivedAt ? true : !member.archivedAt))
        .map((member) => ({
          personId: member.person.id,
          validFrom: member.validFrom,
          validUntil: member.validUntil,
          unlimited: member.unlimited,
        })),
    };
  }

  private newAssignment(subject: {
    personId?: string;
    groupId?: string;
  }): PermissionRoleSaveInput['assignments'][number] {
    return { ...subject, validFrom: null, validUntil: null, unlimited: true, scopes: [this.newScope('GLOBAL')] };
  }

  private newScope(scope: PermissionScope): PermissionRoleSaveInput['assignments'][number]['scopes'][number] {
    const firstTarget = this.targets()[scope][0]?.id ?? null;
    return {
      scope,
      eventId: scope === 'EVENT' ? firstTarget : null,
      majorEventId: scope === 'MAJOR_EVENT' ? firstTarget : null,
      eventGroupId: scope === 'EVENT_GROUP' ? firstTarget : null,
      validFrom: null,
      validUntil: null,
      unlimited: true,
    };
  }

  private targetAncestors(scope: PermissionScope, targetId: string): Set<string> {
    const ancestors = new Set<string>();
    let currentScope = scope;
    let currentId: string | null = targetId;
    while (currentId && currentScope !== 'GLOBAL') {
      const target = this.targets()[currentScope].find((item) => item.id === currentId);
      const parentId = target?.parentId ?? null;
      if (!parentId || ancestors.has(parentId)) break;
      ancestors.add(parentId);
      if (this.targets().EVENT_GROUP.some((item) => item.id === parentId)) currentScope = 'EVENT_GROUP';
      else if (this.targets().MAJOR_EVENT.some((item) => item.id === parentId)) currentScope = 'MAJOR_EVENT';
      else break;
      currentId = parentId;
    }
    return ancestors;
  }
}
