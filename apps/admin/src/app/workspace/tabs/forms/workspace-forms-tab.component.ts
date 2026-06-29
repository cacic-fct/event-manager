import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { Permission } from '@cacic-fct/shared-permissions';
import { EventFormBuilderComponent, EventFormRendererComponent } from '@cacic-fct/shared-angular';
import {
  EventForm,
  EventFormAudience,
  EventFormResponseMode,
  EventFormSigilo,
} from '@cacic-fct/event-manager-admin-contracts';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { WorkspaceFormsService } from '../../../shared/services/workspace-forms.service';
import { DeleteEventFormDialogComponent } from './delete-event-form-dialog.component';
import { WorkspaceFormResultsComponent } from './workspace-form-results.component';

@Component({
  selector: 'app-workspace-forms-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
    EventFormBuilderComponent,
    EventFormRendererComponent,
    WorkspaceFormResultsComponent,
  ],
  templateUrl: './workspace-forms-tab.component.html',
  styleUrls: ['../workspace-tab.shared.scss', './workspace-forms-tab.component.scss'],
})
export class WorkspaceFormsTabComponent implements OnDestroy {
  readonly workspace = inject(WorkspaceFormsService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  protected readonly permissions = inject(WorkspacePermissionsService);
  protected readonly Permission = Permission;
  protected readonly sigiloOptions: EventFormSigilo[] = ['PUBLIC', 'PARTIALLY_SECRET', 'SECRET', 'ANONYMOUS'];
  protected readonly responseModeOptions: EventFormResponseMode[] = ['ONE_PER_TARGET', 'MULTIPLE_PER_TARGET', 'SINGLE_PER_FORM'];

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const eventId = params.get('eventId')?.trim();
      const majorEventId = params.get('majorEventId')?.trim();
      this.workspace.setTargetFilter(eventId ? { eventId } : majorEventId ? { majorEventId } : null);
      void this.workspace.initialize();
    });
  }

  ngOnDestroy(): void {
    this.workspace.closeResultsStream();
  }

  sigiloLabel(sigilo: EventFormSigilo): string {
    switch (sigilo) {
      case 'PUBLIC':
        return 'Público';
      case 'PARTIALLY_SECRET':
        return 'Parcialmente sigiloso';
      case 'SECRET':
        return 'Sigiloso';
      case 'ANONYMOUS':
        return 'Anônimo';
    }
  }

  sigiloDescription(sigilo: EventFormSigilo): string {
    switch (sigilo) {
      case 'PUBLIC':
        return 'Administradores, ministrantes e pessoas inscritas ou presentes podem ver quem respondeu e as respostas.';
      case 'PARTIALLY_SECRET':
        return 'Administradores veem tudo; demais pessoas autorizadas veem quem respondeu, sem respostas individuais.';
      case 'SECRET':
        return 'Apenas administradores veem quem respondeu e as respostas individuais.';
      case 'ANONYMOUS':
        return 'Administradores auditam o envio, mas as respostas ficam sem pessoa e sem horário para terceiros.';
    }
  }

  sigiloIcon(sigilo: EventFormSigilo): string {
    switch (sigilo) {
      case 'PUBLIC':
        return 'visibility';
      case 'PARTIALLY_SECRET':
        return 'group';
      case 'SECRET':
        return 'lock';
      case 'ANONYMOUS':
        return 'shield_lock';
    }
  }

  responseModeLabel(mode: EventFormResponseMode): string {
    switch (mode) {
      case 'ONE_PER_TARGET':
        return 'Uma resposta por evento';
      case 'MULTIPLE_PER_TARGET':
        return 'Várias respostas por evento';
      case 'SINGLE_PER_FORM':
        return 'Uma resposta para o formulário inteiro';
    }
  }

  responseModeDescription(mode: EventFormResponseMode): string {
    switch (mode) {
      case 'ONE_PER_TARGET':
        return 'A mesma pessoa pode responder uma vez para cada evento ou grande evento vinculado.';
      case 'MULTIPLE_PER_TARGET':
        return 'A mesma pessoa pode enviar novas respostas para o mesmo evento ou grande evento.';
      case 'SINGLE_PER_FORM':
        return 'A primeira resposta vale para todos os eventos e grandes eventos onde este formulário aparecer.';
    }
  }

  audienceLabel(audience: EventFormAudience | null | undefined): string {
    switch (audience) {
      case 'SUBSCRIBERS':
        return 'Inscritos';
      case 'ATTENDEES':
        return 'Participantes com presença';
      default:
        return 'Inscritos ou presentes';
    }
  }

  stateLabel(form: EventForm): string {
    switch (form.publicationState) {
      case 'PUBLISHED':
        return 'Publicado';
      case 'SCHEDULED':
        return 'Agendado';
      case 'UNPUBLISHED':
        return 'Fora do ar';
      default:
        return 'Rascunho';
    }
  }

  canEditSelected(): boolean {
    const selected = this.workspace.selectedForm();
    return this.permissions.canEdit(selected ? Permission.EventForm.Update : Permission.EventForm.Create);
  }

  updateLinkOrder(localId: string, event: Event): void {
    const value = event.target instanceof HTMLInputElement ? Number(event.target.value) : 0;
    this.workspace.updateLink(localId, { displayOrder: Number.isFinite(value) ? value : 0 });
  }

  updateLinkDate(localId: string, key: 'availableFrom' | 'availableUntil', event: Event): void {
    const value = event.target instanceof HTMLInputElement ? event.target.value : '';
    this.workspace.updateLinkDate(localId, key, value);
  }

  confirmDelete(): void {
    const selected = this.workspace.selectedForm();
    if (!selected) {
      return;
    }

    if (selected.responseCount === 0) {
      void this.workspace.delete();
      return;
    }

    this.dialog
      .open<DeleteEventFormDialogComponent, { name: string; responseCount: number }, boolean>(
        DeleteEventFormDialogComponent,
        {
          data: {
            name: selected.name,
            responseCount: selected.responseCount,
          },
          width: 'min(420px, 96vw)',
        },
      )
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          void this.workspace.delete();
        }
      });
  }
}
