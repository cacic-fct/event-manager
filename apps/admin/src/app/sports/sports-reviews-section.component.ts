import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SportsTeamLogoComponent } from '@cacic-fct/shared-angular';
import type { SportsTeamRead } from './sports.models';
import { SportsWorkspaceSection } from './sports-workspace-section.base';

const IDENTITY_TYPE_LABELS: Readonly<Record<string, string>> = {
  EMAIL: 'E-mail',
  PHONE: 'Telefone',
  IDENTITY_DOCUMENT: 'Documento de identidade',
};

const IDENTITY_STATUS_LABELS: Readonly<Record<string, string>> = {
  PENDING: 'Aguardando resolução',
  RESOLVED: 'Pessoa localizada',
  NOT_FOUND: 'Pessoa não localizada',
  AMBIGUOUS: 'Mais de uma pessoa localizada',
  REJECTED: 'Identificação rejeitada',
};

const TEAM_CHANGE_REQUEST_STATUS_LABELS: Readonly<Record<string, string>> = {
  PENDING: 'Aguardando análise',
  CONFLICT: 'Equipe alterada desde o envio',
  APPROVED: 'Solicitação aprovada',
  CHANGES_REQUESTED: 'Ajustes solicitados',
  REJECTED: 'Solicitação negada',
  SUPERSEDED: 'Substituída por outro pedido',
};

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

  protected teamChangeRequestStatusLabel(status: string): string {
    return TEAM_CHANGE_REQUEST_STATUS_LABELS[status] ?? 'Situação da solicitação não informada';
  }

  protected identityTypeLabel(type: string): string {
    return IDENTITY_TYPE_LABELS[type] ?? 'Tipo de identificação não informado';
  }

  protected identityStatusLabel(status: string): string {
    return IDENTITY_STATUS_LABELS[status] ?? 'Situação da identificação não informada';
  }
}
