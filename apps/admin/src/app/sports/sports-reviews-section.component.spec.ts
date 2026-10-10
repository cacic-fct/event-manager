import { SportsReviewsSectionComponent } from './sports-reviews-section.component';

class SportsReviewsSectionHarness extends SportsReviewsSectionComponent {
  teamChangeRequestStatus(status: string): string {
    return this.teamChangeRequestStatusLabel(status);
  }

  identityType(type: string): string {
    return this.identityTypeLabel(type);
  }

  identityStatus(status: string): string {
    return this.identityStatusLabel(status);
  }
}

describe('SportsReviewsSectionComponent labels', () => {
  let section: SportsReviewsSectionHarness;

  beforeEach(() => {
    section = Object.create(SportsReviewsSectionHarness.prototype) as SportsReviewsSectionHarness;
  });

  it('explains why a changed team request cannot be approved', () => {
    expect(section.teamChangeRequestStatus('CONFLICT')).toBe('Equipe alterada desde o envio');
    expect(section.teamChangeRequestStatus('PENDING')).toBe('Aguardando análise');
    expect(section.teamChangeRequestStatus('APPROVED')).toBe('Solicitação aprovada');
    expect(section.teamChangeRequestStatus('REJECTED')).toBe('Solicitação negada');
    expect(section.teamChangeRequestStatus('UNKNOWN_STATUS')).toBe('Situação da solicitação não informada');
  });

  it('localizes identity types and statuses, including unspecified values', () => {
    expect(section.identityType('EMAIL')).toBe('E-mail');
    expect(section.identityType('UNKNOWN_TYPE')).toBe('Tipo de identificação não informado');
    expect(section.identityStatus('RESOLVED')).toBe('Pessoa localizada');
    expect(section.identityStatus('UNKNOWN_STATUS')).toBe('Situação da identificação não informada');
  });
});
