import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { Permission } from '@cacic-fct/shared-permissions';
import { MergeCandidateStatus, MergeMatchMethod } from '@cacic-fct/event-manager-admin-contracts';
import { WorkspaceMergeCandidatesService } from '../../../shared/services/workspace-merge-candidates.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';

@Component({
  selector: 'app-workspace-merge-candidates-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatListModule, MatSelectModule],
  templateUrl: './workspace-merge-candidates-tab.component.html',
  styleUrl: '../workspace-tab.shared.scss',
})
export class WorkspaceMergeCandidatesTabComponent {
  readonly workspace = inject(WorkspaceMergeCandidatesService);
  protected readonly permissions = inject(WorkspacePermissionsService);
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
