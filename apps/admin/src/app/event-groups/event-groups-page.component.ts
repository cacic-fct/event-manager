import { WorkspaceRecordComponent } from '../shared/workspace-record.component';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { combineLatest, of } from 'rxjs';
import { CreationParentError, type CreationParentSummary } from '../events/events.service';
import { MatMenuModule } from '@angular/material/menu';
import { Component, DestroyRef, computed, effect, signal, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink, type ParamMap } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Permission } from '@cacic-fct/shared-permissions';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { EventGroup, PublicationState } from '@cacic-fct/event-manager-admin-contracts';
import type { AttendanceEligibility } from '@cacic-fct/shared-event-participation';
import { isFrozenEventGroup } from '../resource-state/frozen-resource';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { EventGroupsService } from './event-groups.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AudienceEditorComponent } from '../shared/audience-editor/audience-editor.component';
import { DatePipe } from '@angular/common';
import {
  attendanceEligibilityOptionsFor,
  displayAttendanceEligibility,
  attendanceEligibilityHint,
  attendanceEligibilityLabel,
  type AttendanceEligibilityOption,
  type AttendanceEligibilityParent,
} from '../shared/event-participation-policy';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';

@Component({
  selector: 'app-workspace-event-groups-tab',
  imports: [
    WorkspaceRecordComponent,
    MatProgressBarModule,
    MatMenuModule,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    MatTooltipModule,
    TwemojiComponent,
    DatePipe,
    AudienceEditorComponent,
  ],
  templateUrl: './event-groups-page.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/entity-permissions.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
  ],
})
export class EventGroupsPageComponent {
  readonly workspace = inject(EventGroupsService);
  private readonly pendingChanges = inject(WorkspacePendingChangesService);
  private readonly pendingRegistration = this.pendingChanges.register();
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  protected readonly auditLog = inject(AuditLogService);
  protected readonly permissions = inject(PermissionsService);
  protected readonly Permission = Permission;

  readonly contextLoading = signal(true);
  readonly contextError = signal('');
  readonly contextReady = computed(() => !this.contextLoading() && !this.contextError());
  readonly creationParents = signal<CreationParentSummary[]>([]);
  private contextRequest = 0;
  private lastContext: {params: ParamMap; query: ParamMap | null} | null = null;

  constructor() {
    effect(() => this.pendingRegistration.set(this.workspace.unsavedChanges()));
    this.destroyRef.onDestroy(() => this.pendingRegistration.destroy());
    combineLatest([this.route.paramMap, this.route.queryParamMap ?? of(null)])
      .pipe(takeUntilDestroyed()).subscribe(([params, query]) => {
        this.lastContext = {params, query};
        void this.initializeContext(params, query);
      });
  }

  retryContext(): void {
    if (this.lastContext) void this.initializeContext(this.lastContext.params, this.lastContext.query);
  }

  private async initializeContext(params: ParamMap, query: ParamMap | null): Promise<void> {
    const request = ++this.contextRequest;
    const id = params.get('groupId') ?? (params.get('targetType') === 'group' ? params.get('targetId') : null);
    this.contextLoading.set(true);
    this.contextError.set('');
    this.creationParents.set([]);
    try {
      if (id) { await this.workspace.pickEventGroupById(id); }
      else { const parents = await this.workspace.initializeNewEventGroup(query?.get('majorEventId')); if (request === this.contextRequest) this.creationParents.set(parents); }
    } catch (error) {
      if (request === this.contextRequest) this.contextError.set(error instanceof CreationParentError ? error.message : 'Não foi possível carregar este contexto. Confira o vínculo e tente novamente.');
    } finally {
      if (request === this.contextRequest) this.contextLoading.set(false);
    }
  }

  protected canEditGroup(group: EventGroup | null | undefined): boolean {
    return (
      this.permissions.canEdit(group ? Permission.EventGroup.Update : Permission.EventGroup.Create) &&
      (!group || !this.isGroupFrozen(group) || this.permissions.has(Permission.Frozen.Update))
    );
  }

  protected canDeleteGroup(group: EventGroup): boolean {
    return (
      this.permissions.canDelete(Permission.EventGroup.Delete) &&
      (!this.isGroupFrozen(group) || this.permissions.has(Permission.Frozen.Delete))
    );
  }

  protected canCloneGroup(): boolean {
    return this.permissions.hasAll([Permission.EventGroup.Read, Permission.EventGroup.Create]);
  }

  protected attendanceEligibilityLabel(policy: AttendanceEligibility | null | undefined): string {
    return attendanceEligibilityLabel(policy);
  }

  protected attendanceEligibilityParent(): AttendanceEligibilityParent {
    return this.workspace.eventGroupForm.controls.majorEventId.value ? 'MAJOR' : 'NONE';
  }

  protected attendanceEligibilityOptions(): AttendanceEligibilityOption[] {
    return attendanceEligibilityOptionsFor(
      'EVENT_GROUP',
      this.attendanceEligibilityParent(),
      this.workspace.eventGroupForm.controls.attendanceEligibility.value,
    );
  }

  protected attendanceEligibilityDisplayValue(): AttendanceEligibility | null {
    return displayAttendanceEligibility(
      this.workspace.eventGroupForm.controls.attendanceEligibility.value,
      'EVENT_GROUP',
      this.attendanceEligibilityParent(),
    );
  }

  protected attendanceEligibilityCompareWith = (
    option: AttendanceEligibility | null,
    value: AttendanceEligibility | null,
  ): boolean => {
    return option === displayAttendanceEligibility(value, 'EVENT_GROUP', this.attendanceEligibilityParent());
  };

  protected attendanceEligibilityHint(): string {
    return attendanceEligibilityHint();
  }

  protected draftGroupActionLabel(): string {
    const state = this.selectedGroupPublicationState();
    return state === 'PUBLISHED' || state === 'SCHEDULED' ? 'Voltar para rascunho' : 'Salvar rascunho';
  }

  protected draftGroupActionTooltip(): string {
    const state = this.selectedGroupPublicationState();
    if (state === 'PUBLISHED') {
      return 'Salva as alterações e retira do ar os eventos vinculados ao grupo, deixando-os como rascunho.';
    }

    if (state === 'SCHEDULED') {
      return 'Salva as alterações e cancela o agendamento dos eventos vinculados, deixando-os como rascunho.';
    }

    return 'Salva sem publicar. O grupo continua fora do ar até ter eventos publicados.';
  }

  protected publishGroupActionLabel(): string {
    if (this.workspace.eventGroupEvents().length === 0) {
      return 'Salvar grupo';
    }

    const state = this.selectedGroupPublicationState();
    if (state === 'PUBLISHED') {
      return 'Atualizar publicação';
    }

    if (state === 'SCHEDULED') {
      return 'Publicar agora';
    }

    return 'Publicar';
  }

  protected publishGroupActionTooltip(): string {
    if (this.workspace.eventGroupEvents().length === 0) {
      return 'Salva o grupo. Vincule eventos antes de publicar o conjunto.';
    }

    const state = this.selectedGroupPublicationState();
    if (state === 'PUBLISHED') {
      return 'Salva as alterações e mantém os eventos vinculados publicados com a versão atualizada.';
    }

    if (state === 'SCHEDULED') {
      return 'Salva as alterações, cancela o agendamento e publica os eventos vinculados imediatamente.';
    }

    return 'Salva e publica os eventos vinculados ao grupo imediatamente.';
  }

  protected publishGroupActionIcon(): string {
    return this.selectedGroupPublicationState() === 'PUBLISHED' ? 'sync' : 'publish';
  }

  protected canEditSelectedGroupEvents(): boolean {
    return this.canEditGroup(this.workspace.selectedEventGroup());
  }

  private selectedGroupPublicationState(): PublicationState {
    const events = this.workspace.eventGroupEvents();
    if (events.some((eventItem) => eventItem.publicationState === 'PUBLISHED')) {
      return 'PUBLISHED';
    }

    if (events.some((eventItem) => eventItem.publicationState === 'SCHEDULED')) {
      return 'SCHEDULED';
    }

    if (events.length > 0 && events.every((eventItem) => eventItem.publicationState === 'UNPUBLISHED')) {
      return 'UNPUBLISHED';
    }

    return 'DRAFT';
  }

  private isGroupFrozen(group: EventGroup): boolean {
    const events =
      this.workspace.selectedEventGroup()?.id === group.id
        ? this.workspace.eventGroupEvents()
        : this.workspace.eventSummaries().filter((eventItem) => eventItem.eventGroupId === group.id);
    return isFrozenEventGroup(group, events);
  }
}
