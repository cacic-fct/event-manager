import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
import { EventForm, EventFormAudience, EventFormSigilo } from '@cacic-fct/event-manager-admin-contracts';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { WorkspaceFormsService } from '../../../shared/services/workspace-forms.service';
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
export class WorkspaceFormsTabComponent {
  readonly workspace = inject(WorkspaceFormsService);
  private readonly route = inject(ActivatedRoute);
  protected readonly permissions = inject(WorkspacePermissionsService);
  protected readonly Permission = Permission;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const eventId = params.get('eventId')?.trim();
      const majorEventId = params.get('majorEventId')?.trim();
      this.workspace.setTargetFilter(eventId ? { eventId } : majorEventId ? { majorEventId } : null);
      void this.workspace.initialize();
    });
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
}
