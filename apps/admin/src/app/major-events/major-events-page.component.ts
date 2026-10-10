import { WorkspaceRecordComponent } from '../shared/workspace-record.component';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { combineLatest, of } from 'rxjs';
import type { CreationParentSummary } from '../events/events.service';
import { MatMenuModule } from '@angular/material/menu';
import { MatExpansionModule } from '@angular/material/expansion';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, signal, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink, type ParamMap } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Permission } from '@cacic-fct/shared-permissions';
import { MarkdownPreviewDialogComponent, TwemojiComponent } from '@cacic-fct/shared-angular';
import { MajorEvent, PublicationState } from '@cacic-fct/event-manager-admin-contracts';
import type { AttendanceEligibility } from '@cacic-fct/shared-event-participation';
import { isFrozenMajorEvent } from '../resource-state/frozen-resource';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { MajorEventsService } from './major-events.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AudienceEditorComponent } from '../shared/audience-editor/audience-editor.component';
import {
  attendanceEligibilityOptionsFor,
  displayAttendanceEligibility,
  attendanceEligibilityHint,
  attendanceEligibilityLabel,
  type AttendanceEligibilityOption,
} from '../shared/event-participation-policy';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';

@Component({
  selector: 'app-workspace-major-events-tab',
  imports: [
    WorkspaceRecordComponent,
    MatProgressBarModule,
    MatMenuModule,
    MatExpansionModule,
    RouterLink,
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatRadioModule,
    MatSelectModule,
    MatTooltipModule,
    TwemojiComponent,
    AudienceEditorComponent,
  ],
  templateUrl: './major-events-page.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/entity-permissions.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
  ],
})
export class MajorEventsPageComponent {
  readonly workspace = inject(MajorEventsService);
  private readonly pendingChanges = inject(WorkspacePendingChangesService);
  private readonly pendingRegistration = this.pendingChanges.register(() => this.workspace.discardChanges());
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
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
        void this.initializeContext(params);
      });
  }

  retryContext(): void {
    if (this.lastContext) void this.initializeContext(this.lastContext.params);
  }

  private async initializeContext(params: ParamMap): Promise<void> {
    const request = ++this.contextRequest;
    const targetType = params.get('targetType') ?? this.route.snapshot.data['targetType'];
    const id = params.get('majorEventId') ?? (targetType === 'major-event' ? params.get('targetId') : null);
    this.contextLoading.set(true);
    this.contextError.set('');
    this.creationParents.set([]);
    try {
      if (id) { await this.workspace.pickMajorEventById(id); }
      else { this.workspace.resetMajorEventForm(false); }
    } catch {
      if (request === this.contextRequest) this.contextError.set('Não foi possível carregar este contexto. Confira o vínculo e tente novamente.');
    } finally {
      if (request === this.contextRequest) this.contextLoading.set(false);
    }
  }

  protected previewDescription(): void {
    this.dialog.open(MarkdownPreviewDialogComponent, {
      data: {
        content: this.workspace.majorEventForm.controls.description.value,
        title: 'Pré-visualização da descrição do grande evento',
      },
      maxWidth: 'calc(100vw - 32px)',
    });
  }

  protected canEditMajorEvent(majorEvent: MajorEvent | null | undefined): boolean {
    return (
      this.permissions.canEdit(majorEvent ? Permission.MajorEvent.Update : Permission.MajorEvent.Create) &&
      (!majorEvent || !isFrozenMajorEvent(majorEvent) || this.permissions.has(Permission.Frozen.Update))
    );
  }

  protected canDeleteMajorEvent(majorEvent: MajorEvent): boolean {
    return (
      this.permissions.canDelete(Permission.MajorEvent.Delete) &&
      (!isFrozenMajorEvent(majorEvent) || this.permissions.has(Permission.Frozen.Delete))
    );
  }

  protected canCloneMajorEvent(): boolean {
    return this.permissions.hasAll([Permission.MajorEvent.Read, Permission.MajorEvent.Create]);
  }

  protected attendanceEligibilityLabel(policy: AttendanceEligibility | null | undefined): string {
    return attendanceEligibilityLabel(policy);
  }

  protected attendanceEligibilityOptions(): AttendanceEligibilityOption[] {
    return attendanceEligibilityOptionsFor(
      'MAJOR_EVENT',
      'NONE',
      this.workspace.majorEventForm.controls.attendanceEligibility.value,
    );
  }

  protected attendanceEligibilityDisplayValue(): AttendanceEligibility | null {
    return displayAttendanceEligibility(
      this.workspace.majorEventForm.controls.attendanceEligibility.value,
      'MAJOR_EVENT',
      'NONE',
    );
  }

  protected attendanceEligibilityCompareWith = (
    option: AttendanceEligibility | null,
    value: AttendanceEligibility | null,
  ): boolean => {
    return option === displayAttendanceEligibility(value, 'MAJOR_EVENT', 'NONE');
  };

  protected attendanceEligibilityHint(): string {
    return attendanceEligibilityHint();
  }

  protected draftMajorEventActionLabel(): string {
    const state = this.workspace.selectedMajorEvent()?.publicationState;
    return state === 'PUBLISHED' || state === 'SCHEDULED' ? 'Voltar para rascunho' : 'Salvar rascunho';
  }

  protected draftMajorEventActionTooltip(): string {
    return this.draftActionTooltip(this.workspace.selectedMajorEvent()?.publicationState);
  }

  protected publishMajorEventActionLabel(): string {
    return this.publishActionLabel(this.workspace.selectedMajorEvent()?.publicationState);
  }

  protected publishMajorEventActionTooltip(): string {
    return this.publishActionTooltip(this.workspace.selectedMajorEvent()?.publicationState);
  }

  protected publishMajorEventActionIcon(): string {
    return this.workspace.selectedMajorEvent()?.publicationState === 'PUBLISHED' ? 'sync' : 'publish';
  }

  private draftActionTooltip(state: PublicationState | null | undefined): string {
    if (state === 'PUBLISHED') {
      return 'Salva as alterações e retira o grande evento do ar, deixando-o como rascunho.';
    }

    if (state === 'SCHEDULED') {
      return 'Salva as alterações e cancela o agendamento, deixando o grande evento como rascunho.';
    }

    return 'Salva sem publicar. O grande evento continua fora do ar.';
  }

  private publishActionLabel(state: PublicationState | null | undefined): string {
    if (state === 'PUBLISHED') {
      return 'Atualizar publicação';
    }

    if (state === 'SCHEDULED') {
      return 'Publicar agora';
    }

    return 'Publicar';
  }

  private publishActionTooltip(state: PublicationState | null | undefined): string {
    if (state === 'PUBLISHED') {
      return 'Salva as alterações e mantém o grande evento publicado com a versão atualizada.';
    }

    if (state === 'SCHEDULED') {
      return 'Salva as alterações, cancela o agendamento e publica o grande evento imediatamente.';
    }

    return 'Salva e publica o grande evento imediatamente.';
  }

  protected canEditSelectedMajorEventEvents(): boolean {
    const selectedMajorEvent = this.workspace.selectedMajorEvent();
    return (
      this.permissions.hasAny([Permission.Event.Create, Permission.Event.Update]) &&
      (!selectedMajorEvent || !isFrozenMajorEvent(selectedMajorEvent) || this.permissions.has(Permission.Frozen.Update))
    );
  }
}
