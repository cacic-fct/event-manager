import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Permission } from '@cacic-fct/shared-permissions';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { EventGroup, PublicationState } from '../../../graphql/models';
import { isFrozenEventGroup } from '../../../shared/frozen-resource';
import { WorkspaceAuditLogService } from '../../../shared/services/workspace-audit-log.service';
import { WorkspaceEventGroupsService } from '../../../shared/services/workspace-event-groups.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-workspace-event-groups-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatTooltipModule,
    TwemojiComponent,
    DatePipe,
  ],
  templateUrl: './workspace-event-groups-tab.component.html',
  styleUrl: '../workspace-tab.shared.scss',
})
export class WorkspaceEventGroupsTabComponent {
  readonly workspace = inject(WorkspaceEventGroupsService);
  private readonly route = inject(ActivatedRoute);
  protected readonly auditLog = inject(WorkspaceAuditLogService);
  protected readonly permissions = inject(WorkspacePermissionsService);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const groupId = params.get('groupId');
      if (groupId) {
        void this.workspace.pickEventGroupById(groupId);
        return;
      }

      if (this.workspace.selectedEventGroup()) {
        this.workspace.startNewEventGroup();
      }
    });
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
    const events = this.workspace.eventSummaries().filter((eventItem) => eventItem.eventGroupId === group.id);
    return isFrozenEventGroup(group, events);
  }
}
