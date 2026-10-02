import { MatProgressBarModule } from '@angular/material/progress-bar';
import { combineLatest, of } from 'rxjs';
import { CreationParentError, type CreationParentSummary } from '../events/events.service';
import { MatMenuModule } from '@angular/material/menu';
import { WorkspaceScopeComponent } from '../shared/workspace-scope.component';
import { MatExpansionModule } from '@angular/material/expansion';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, signal, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink, type ParamMap } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Permission } from '@cacic-fct/shared-permissions';
import { MarkdownPreviewDialogComponent, TwemojiComponent } from '@cacic-fct/shared-angular';
import { Event, EventType, MajorEvent, PublicationState } from '@cacic-fct/event-manager-admin-contracts';
import type { AttendanceEligibility } from '@cacic-fct/shared-event-participation';
import { EventsService } from './events.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { isFrozenEvent, isFrozenMajorEvent } from '../resource-state/frozen-resource';
import { PersonSearchComponent } from '../people/person-search/person-search.component';
import { AudienceEditorComponent } from '../shared/audience-editor/audience-editor.component';
import {
  LocationCoordinatePickerDialogComponent,
  type LocationCoordinates,
} from '../app-shell/dialogs/location-coordinate-picker-dialog.component';
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
  selector: 'app-workspace-events-tab',
  imports: [
    MatProgressBarModule,
    MatMenuModule,
    WorkspaceScopeComponent,
    MatExpansionModule,
    RouterLink,
    DatePipe,
    ReactiveFormsModule,
    MatAutocompleteModule,
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
    PersonSearchComponent,
    AudienceEditorComponent,
  ],
  templateUrl: './events-page.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/entity-permissions.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
  ],
})
export class EventsPageComponent {
  protected associationEmoji(kind: 'group' | 'major-event'): string | null {
    if (kind === 'group') {
      const id = this.workspace.eventForm.controls.eventGroupId.value;
      return this.workspace.eventGroupSearchResults().find((group) => group.id === id)?.emoji
        ?? (this.workspace.selectedEvent()?.eventGroup?.id === id ? this.workspace.selectedEvent()?.eventGroup?.emoji : null) ?? null;
    }
    const id = this.workspace.eventForm.controls.majorEventId.value;
    return this.workspace.majorEventSearchResults().find((major) => major.id === id)?.emoji
      ?? this.workspace.majorEvents().find((major) => major.id === id)?.emoji
      ?? (this.workspace.selectedEvent()?.majorEvent?.id === id ? this.workspace.selectedEvent()?.majorEvent?.emoji : null) ?? null;
  }

  readonly workspace = inject(EventsService);
  private readonly pendingChanges = inject(WorkspacePendingChangesService);
  private readonly pendingRegistration = this.pendingChanges.register();
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
        void this.initializeContext(params, query);
      });
  }

  retryContext(): void {
    if (this.lastContext) void this.initializeContext(this.lastContext.params, this.lastContext.query);
  }

  private async initializeContext(params: ParamMap, query: ParamMap | null): Promise<void> {
    const request = ++this.contextRequest;
    const id = params.get('eventId') ?? (params.get('targetType') === 'event' ? params.get('targetId') : null);
    this.contextLoading.set(true);
    this.contextError.set('');
    this.creationParents.set([]);
    try {
      if (id) {
        const selected = await this.workspace.selectEventById(id, { skipIfCurrent: true });
        if (selected === false && request === this.contextRequest) this.contextError.set('A seleção da versão foi cancelada. Tente novamente para abrir este evento.');
      }
      else { const parents = await this.workspace.initializeNewEvent({eventGroupId:query?.get('eventGroupId'),majorEventId:query?.get('majorEventId')}); if (request === this.contextRequest) this.creationParents.set(parents); }
    } catch (error) {
      if (request === this.contextRequest) this.contextError.set(error instanceof CreationParentError ? error.message : 'Não foi possível carregar este contexto. Confira o vínculo e tente novamente.');
    } finally {
      if (request === this.contextRequest) this.contextLoading.set(false);
    }
  }

  protected previewDescription(): void {
    this.dialog.open(MarkdownPreviewDialogComponent, {
      data: {
        content: this.workspace.eventForm.controls.description.value,
        title: 'Pré-visualização da descrição do evento',
      },
      maxWidth: 'calc(100vw - 32px)',
    });
  }

  protected openLocationPicker(): void {
    const latitude = Number(this.workspace.eventForm.controls.latitude.value);
    const longitude = Number(this.workspace.eventForm.controls.longitude.value);
    const coordinates = Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
    this.dialog
      .open(LocationCoordinatePickerDialogComponent, { data: { coordinates }, maxWidth: 'calc(100vw - 32px)' })
      .afterClosed()
      .subscribe((result: LocationCoordinates | undefined) => {
        if (!result) return;
        this.workspace.eventForm.patchValue({
          latitude: result.latitude.toString(),
          longitude: result.longitude.toString(),
        });
      });
  }

  protected describeEventType(type: EventType | null | undefined): string {
    if (type === 'MINICURSO') {
      return 'Minicurso';
    }

    if (type === 'PALESTRA') {
      return 'Palestra';
    }

    return 'Outro';
  }

  protected canEditEvent(eventItem: Event | null | undefined): boolean {
    return (
      this.permissions.canEdit(eventItem ? Permission.Event.Update : Permission.Event.Create) &&
      (!eventItem || !isFrozenEvent(eventItem) || this.permissions.has(Permission.Frozen.Update))
    );
  }

  protected canDeleteEvent(eventItem: Event): boolean {
    return (
      this.permissions.canDelete(Permission.Event.Delete) &&
      (!isFrozenEvent(eventItem) || this.permissions.has(Permission.Frozen.Delete))
    );
  }

  protected canCloneEvent(): boolean {
    return this.permissions.hasAll([Permission.Event.Read, Permission.Event.Create]);
  }

  protected canAssignMajorEvent(majorEvent: MajorEvent): boolean {
    return (
      this.canEditEvent(this.workspace.selectedEvent()) &&
      (!isFrozenMajorEvent(majorEvent) || this.permissions.has(Permission.Frozen.Update))
    );
  }

  protected majorEventAssignmentTooltip(majorEvent: MajorEvent): string {
    if (!this.canEditEvent(this.workspace.selectedEvent())) {
      return 'Você não tem permissão para alterar este evento.';
    }

    if (isFrozenMajorEvent(majorEvent) && !this.permissions.has(Permission.Frozen.Update)) {
      return 'Este grande evento está congelado e exige permissão para alterar recursos antigos.';
    }

    return `Usar ${majorEvent.name}`;
  }

  protected majorEventEmojiById(majorEventId: string | null | undefined): string | null {
    if (!majorEventId) {
      return null;
    }

    return (
      this.workspace.majorEventSearchResults().find((majorEvent) => majorEvent.id === majorEventId)?.emoji ??
      this.workspace.selectedEvent()?.majorEvent?.emoji ??
      this.workspace.majorEvents().find((majorEvent) => majorEvent.id === majorEventId)?.emoji ??
      null
    );
  }

  protected eventGroupEmojiById(groupId: string | null | undefined): string | null {
    if (!groupId) {
      return null;
    }

    return (
      this.workspace.eventGroupSearchResults().find((group) => group.id === groupId)?.emoji ??
      this.workspace.selectedEvent()?.eventGroup?.emoji ??
      null
    );
  }

  protected attendanceEligibilityLabel(policy: AttendanceEligibility | null | undefined): string {
    return attendanceEligibilityLabel(policy);
  }

  protected attendanceEligibilityParent(): AttendanceEligibilityParent {
    if (this.workspace.eventForm.controls.eventGroupId.value) {
      return 'GROUP';
    }

    if (this.workspace.eventForm.controls.majorEventId.value) {
      return 'MAJOR';
    }

    return 'NONE';
  }

  protected attendanceEligibilityOptions(): AttendanceEligibilityOption[] {
    return attendanceEligibilityOptionsFor(
      'EVENT',
      this.attendanceEligibilityParent(),
      this.workspace.eventForm.controls.attendanceEligibility.value,
      this.attendanceEligibilityHasMajorContext(),
    );
  }

  protected attendanceEligibilityHasMajorContext(): boolean {
    if (this.workspace.eventForm.controls.majorEventId.value) {
      return true;
    }

    const groupId = this.workspace.eventForm.controls.eventGroupId.value;
    return Boolean(
      this.workspace.selectedEvent()?.eventGroup?.majorEventId ??
        this.workspace.eventGroupSearchResults().find((group) => group.id === groupId)?.majorEventId,
    );
  }

  protected attendanceEligibilityDisplayValue(): AttendanceEligibility | null {
    return displayAttendanceEligibility(
      this.workspace.eventForm.controls.attendanceEligibility.value,
      'EVENT',
      this.attendanceEligibilityParent(),
      this.attendanceEligibilityHasMajorContext(),
    );
  }

  protected attendanceEligibilityCompareWith = (
    option: AttendanceEligibility | null,
    value: AttendanceEligibility | null,
  ): boolean => {
    return option ===
      displayAttendanceEligibility(value, 'EVENT', this.attendanceEligibilityParent(), this.attendanceEligibilityHasMajorContext());
  };

  protected attendanceEligibilityHint(): string {
    return attendanceEligibilityHint();
  }

  protected draftEventActionLabel(): string {
    if (this.workspace.selectedEventDraft()) {
      return 'Salvar rascunho';
    }

    const state = this.workspace.selectedEvent()?.publicationState;
    return state === 'PUBLISHED' || state === 'SCHEDULED' ? 'Salvar como rascunho' : 'Salvar rascunho';
  }

  protected draftEventActionTooltip(): string {
    return this.draftActionTooltip(this.workspace.selectedEvent()?.publicationState, 'evento');
  }

  protected publishEventActionLabel(): string {
    if (this.workspace.selectedEventDraft()) {
      return 'Atualizar publicação';
    }

    return this.publishActionLabel(this.workspace.selectedEvent()?.publicationState);
  }

  protected publishEventActionTooltip(): string {
    if (this.workspace.selectedEventDraft()) {
      return 'Aplica este rascunho ao evento publicado e mantém a publicação no ar com a versão atualizada.';
    }

    return this.publishActionTooltip(this.workspace.selectedEvent()?.publicationState, 'evento');
  }

  protected publishEventActionIcon(): string {
    return this.workspace.selectedEventDraft() || this.workspace.selectedEvent()?.publicationState === 'PUBLISHED'
      ? 'sync'
      : 'publish';
  }

  private draftActionTooltip(state: PublicationState | null | undefined, targetLabel: string): string {
    if (state === 'PUBLISHED') {
      return `Cria um rascunho separado para o ${targetLabel}, sem alterar a publicação atual.`;
    }

    if (state === 'SCHEDULED') {
      return `Cria um rascunho separado para o ${targetLabel}, sem cancelar o agendamento atual.`;
    }

    return `Salva sem publicar. O ${targetLabel} continua fora do ar.`;
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

  private publishActionTooltip(state: PublicationState | null | undefined, targetLabel: string): string {
    if (state === 'PUBLISHED') {
      return `Salva as alterações e mantém o ${targetLabel} publicado com a versão atualizada.`;
    }

    if (state === 'SCHEDULED') {
      return `Salva as alterações, cancela o agendamento e publica o ${targetLabel} imediatamente.`;
    }

    return `Salva e publica o ${targetLabel} imediatamente.`;
  }

  protected canEditSelectedEventRelation(
    scope:
      | typeof Permission.EventAttendanceCollector.Create
      | typeof Permission.EventLecturer.Create
      | typeof Permission.Person.Create,
  ): boolean {
    if (this.workspace.selectedEventDraft()) {
      return false;
    }

    return (
      this.permissions.canEdit(scope) &&
      (!this.workspace.selectedEvent() || this.canEditEvent(this.workspace.selectedEvent()))
    );
  }

  protected canRemoveSelectedEventRelation(
    scope: typeof Permission.EventAttendanceCollector.Delete | typeof Permission.EventLecturer.Delete,
  ): boolean {
    if (this.workspace.selectedEventDraft()) {
      return false;
    }

    const selectedEvent = this.workspace.selectedEvent();
    if (!selectedEvent) {
      return this.permissions.canDelete(scope);
    }

    const hasResourcePermission = this.permissions.canDelete(scope);
    return hasResourcePermission && (!isFrozenEvent(selectedEvent) || this.permissions.has(Permission.Frozen.Delete));
  }

  protected displayPlacePresetSuggestion = (placeId: string): string => {
    return this.workspace.displayPlacePresetSuggestion(placeId);
  };
}
