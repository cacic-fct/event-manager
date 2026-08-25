import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SportsTeamLogoComponent } from '@cacic-fct/shared-angular';
import type { SportsTeamRead } from './sports.models';
import { SportsWorkspaceSection } from './sports-workspace-section.base';

@Component({
  selector: 'app-sports-reviews-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatIconModule, SportsTeamLogoComponent],
  templateUrl: './sports-reviews-section.component.html',
})
export class SportsReviewsSectionComponent extends SportsWorkspaceSection {
  protected pendingTeamChangeRequests(requests: SportsTeamRead['changeRequests']): SportsTeamRead['changeRequests'] {
    return requests.filter(
      (request) =>
        request.status === 'PENDING' || request.status === 'CONFLICT' || request.status === 'CHANGES_REQUESTED',
    );
  }

  protected identityTypeLabel(
    type: SportsTeamRead['changeRequests'][number]['identityClaims'][number]['type'],
  ): string {
    return {
      EMAIL: 'E-mail',
      PHONE: 'Telefone',
      IDENTITY_DOCUMENT: 'Documento de identidade',
    }[type];
  }

  protected identityStatusLabel(
    status: SportsTeamRead['changeRequests'][number]['identityClaims'][number]['status'],
  ): string {
    return {
      PENDING: 'Aguardando resolução',
      RESOLVED: 'Pessoa localizada',
      NOT_FOUND: 'Pessoa não localizada',
      AMBIGUOUS: 'Mais de uma pessoa localizada',
      REJECTED: 'Identificação rejeitada',
    }[status];
  }
}
