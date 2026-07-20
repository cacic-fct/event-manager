import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { Permission } from '@cacic-fct/shared-permissions';
import { MergeCandidateStatus, MergeMatchMethod } from '@cacic-fct/event-manager-admin-contracts';
import { MergeCandidatesService } from './merge-candidates.service';
import { PermissionsService } from '../permissions/permissions.service';

@Component({
  selector: 'app-workspace-merge-candidates-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatListModule, MatSelectModule],
  templateUrl: './merge-candidates-page.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/entity-permissions.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
  ],
})
export class MergeCandidatesPageComponent {
  readonly workspace = inject(MergeCandidatesService);
  protected readonly permissions = inject(PermissionsService);
  protected readonly Permission = Permission;

  protected describeMergeMatchMethod(method: MergeMatchMethod | null | undefined): string {
    if (method === 'CPF') {
      return 'CPF';
    }

    if (method === 'EMAIL') {
      return 'Email';
    }

    if (method === 'NORMALIZED_NAME') {
      return 'Nome normalizado';
    }

    return 'Não informado';
  }

  protected describeMergeStatus(status: MergeCandidateStatus | null | undefined): string {
    if (status === 'PENDING') {
      return 'Pendente';
    }

    if (status === 'MERGED') {
      return 'Unificada';
    }

    if (status === 'REJECTED') {
      return 'Rejeitada';
    }

    if (status === 'STALE') {
      return 'Obsoleta';
    }

    return 'Não informado';
  }
}
