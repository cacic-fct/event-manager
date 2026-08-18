import { CertificateIssuedTo } from '@cacic-fct/shared-data-types';
import { SportsOfficialRole, SportsRosterRole } from '@prisma/client';
import {
  isAutomaticSportsCertificateIssuedTo,
  isManualCertificateIssuedTo,
  sportsCertificateTypeLabel,
  sportsOfficialRoleForCertificate,
  sportsParticipationText,
  sportsRosterRoleForCertificate,
} from './certificate-sports-roles';

describe('sports certificate roles', () => {
  it.each([
    [CertificateIssuedTo.SPORTS_PLAYER, SportsRosterRole.PLAYER, 'Atleta'],
    [CertificateIssuedTo.SPORTS_CAPTAIN, SportsRosterRole.CAPTAIN, 'Capitão/Capitã'],
    [CertificateIssuedTo.SPORTS_COACH, SportsRosterRole.COACH, 'Técnico/Técnica'],
  ])('maps %s to its roster role and certificate label', (issuedTo, rosterRole, label) => {
    expect(sportsRosterRoleForCertificate(issuedTo)).toBe(rosterRole);
    expect(sportsCertificateTypeLabel(issuedTo)).toBe(label);
    expect(sportsParticipationText(issuedTo)).toContain('Certificamos a participação');
    expect(isAutomaticSportsCertificateIssuedTo(issuedTo)).toBe(true);
  });

  it.each([
    [CertificateIssuedTo.SPORTS_REFEREE, SportsOfficialRole.REFEREE, 'Árbitro/Árbitra'],
    [CertificateIssuedTo.SPORTS_INTERMEDIATOR, SportsOfficialRole.INTERMEDIATOR, 'Intermediador/Intermediadora'],
    [CertificateIssuedTo.SPORTS_SCOREKEEPER, SportsOfficialRole.SCOREKEEPER, 'Responsável pela pontuação'],
  ])('maps %s to its official role and certificate label', (issuedTo, officialRole, label) => {
    expect(sportsOfficialRoleForCertificate(issuedTo)).toBe(officialRole);
    expect(sportsCertificateTypeLabel(issuedTo)).toBe(label);
    expect(sportsParticipationText(issuedTo)).toContain('Certificamos a participação');
    expect(isAutomaticSportsCertificateIssuedTo(issuedTo)).toBe(true);
  });

  it('keeps organizers distinct while using manual recipient issuance', () => {
    expect(sportsCertificateTypeLabel(CertificateIssuedTo.SPORTS_ORGANIZER)).toBe('Organização');
    expect(sportsParticipationText(CertificateIssuedTo.SPORTS_ORGANIZER)).toContain('organização');
    expect(isAutomaticSportsCertificateIssuedTo(CertificateIssuedTo.SPORTS_ORGANIZER)).toBe(false);
    expect(isManualCertificateIssuedTo(CertificateIssuedTo.SPORTS_ORGANIZER)).toBe(true);
    expect(isManualCertificateIssuedTo(CertificateIssuedTo.OTHER)).toBe(true);
  });
});
