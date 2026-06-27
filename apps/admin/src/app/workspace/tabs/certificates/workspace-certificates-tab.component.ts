import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { FormField } from '@angular/forms/signals';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Permission } from '@cacic-fct/shared-permissions';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { Certificate, CertificateConfig } from '@cacic-fct/event-manager-admin-contracts';
import { isFrozenEvent, isFrozenEventGroup, isFrozenMajorEvent } from '../../../shared/frozen-resource';
import { WorkspaceCertificatesService } from '../../../shared/services/workspace-certificates.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';

@Component({
  selector: 'app-workspace-certificates-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormField,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    MatTooltipModule,
    TwemojiComponent,
  ],
  templateUrl: './workspace-certificates-tab.component.html',
  styleUrl: '../workspace-tab.shared.scss',
})
export class WorkspaceCertificatesTabComponent {
  readonly workspace = inject(WorkspaceCertificatesService);
  private readonly route = inject(ActivatedRoute);
  protected readonly permissions = inject(WorkspacePermissionsService);
  protected readonly Permission = Permission;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.workspace.selectTargetByRoute(params.get('targetType'), params.get('targetId'), params.get('configId'));
    });
  }

  protected canEditSelectedTarget(): boolean {
    return (
      this.permissions.hasAny([
        Permission.Certificate.Issue,
        Permission.Certificate.Reissue,
        Permission.CertificateConfig.Create,
        Permission.CertificateConfig.Update,
      ]) &&
      (!this.selectedTargetFrozen() || this.permissions.has(Permission.Frozen.Update))
    );
  }

  protected canDeleteConfig(config: CertificateConfig): boolean {
    return (
      this.permissions.canDelete(Permission.CertificateConfig.Delete) &&
      (!this.configTargetFrozen(config) || this.permissions.has(Permission.Frozen.Delete))
    );
  }

  protected canDeleteCertificate(certificate: Certificate): boolean {
    return (
      this.permissions.canDelete(Permission.Certificate.Delete) &&
      (!this.configTargetFrozen(certificate.config) || this.permissions.has(Permission.Frozen.Delete))
    );
  }

  private selectedTargetFrozen(): boolean {
    const target = this.workspace.selectedTarget();
    if (!target) {
      return false;
    }

    const scope = this.workspace.targetFiltersForm.controls.scope.value;
    if (scope === 'EVENT') {
      return isFrozenEvent(this.workspace.issuableEvents().find((eventItem) => eventItem.id === target.id));
    }

    if (scope === 'EVENT_GROUP') {
      const group = this.workspace.issuableEventGroups().find((eventGroup) => eventGroup.id === target.id);
      return isFrozenEventGroup(group, []);
    }

    return isFrozenMajorEvent(this.workspace.issuableMajorEvents().find((majorEvent) => majorEvent.id === target.id));
  }

  private configTargetFrozen(config: CertificateConfig): boolean {
    if (config.event) {
      return isFrozenEvent(config.event);
    }

    if (config.eventGroup) {
      return isFrozenEventGroup(config.eventGroup, []);
    }

    if (config.majorEvent) {
      return isFrozenMajorEvent(config.majorEvent);
    }

    return this.selectedTargetFrozen();
  }
}
